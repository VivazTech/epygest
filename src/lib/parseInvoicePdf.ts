export type InvoicePdfExtracted = {
  invoice_number: string;
  provider_name: string;
  client_name: string;
  issue_date: string;
  due_date: string;
  amount: string;
  pix_key: string;
  payment_method: string;
  description: string;
};

const normalizeText = (raw: string) =>
  String(raw || "")
    .replace(/\u00A0/g, " ")
    .replace(/\r/g, "\n");

const linesOf = (text: string) =>
  normalizeText(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** dd/mm/yyyy [hh:mm:ss] → yyyy-mm-dd */
export const parseBrDateToIso = (raw: string): string => {
  const m = String(raw || "").match(/(\d{2})[/.-](\d{2})[/.-](\d{4})/);
  if (!m) return "";
  const [, d, mo, y] = m;
  return `${y}-${mo}-${d}`;
};

/** 1.234,56 → 1234.56 */
export const parseBrMoney = (raw: string): string => {
  const s = String(raw || "").trim();
  if (!s) return "";
  const m = s.match(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/);
  if (!m) return "";
  const normalized = m[1].replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n.toFixed(2) : "";
};

const lastDayOfMonthIso = (month: number, year: number): string => {
  if (!month || !year) return "";
  const d = new Date(year, month, 0);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const sectionValueAfterLabel = (lines: string[], sectionStart: RegExp, label: RegExp): string => {
  const start = lines.findIndex((l) => sectionStart.test(l));
  if (start < 0) return "";
  const slice = lines.slice(start, start + 25);
  const labelIdx = slice.findIndex((l) => label.test(l));
  if (labelIdx < 0) return "";
  for (let i = labelIdx + 1; i < slice.length; i++) {
    const line = slice[i];
    if (/^(cpf|cnpj|inscri|endere|nome fantasia|e-?mail|fone|servi|descri)/i.test(line)) break;
    if (line.length >= 3 && !/^(raz[aã]o social|nome\/raz[aã]o social)$/i.test(line)) {
      return line;
    }
  }
  return "";
};

const extractInvoiceNumberFromChave = (chave: string): string => {
  const digits = String(chave || "").replace(/\D/g, "");
  if (digits.length < 30) return "";

  // Padrão NFS-e Nacional: bloco 00000006526 (número com zeros à esquerda)
  const padded = digits.match(/0{6}(\d+?)(?=0)/);
  if (padded?.[1]) return String(parseInt(padded[1], 10));

  if (digits.length >= 35) {
    const numeroPadded = digits.slice(22, 35);
    const n = parseInt(numeroPadded, 10);
    if (Number.isFinite(n) && n > 0 && n < 1_000_000_000) return String(n);
  }
  return "";
};

const extractValorTotalNota = (text: string): string => {
  const valoresStart = text.search(/VALORES/i);
  if (valoresStart < 0) return "";
  const outrasIdx = text.search(/OUTRAS INFORMA[ÇC][ÕO]ES/i);
  const blockEnd = outrasIdx > valoresStart ? outrasIdx : valoresStart + 350;
  const block = text.slice(valoresStart, blockEnd);

  const headerIdx = block.search(/Valor\s+Total\s+da\s+Nota/i);
  if (headerIdx < 0) return "";

  const afterHeader = block.slice(headerIdx);
  const amounts = [...afterHeader.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})/g)].map((m) => m[1]);
  if (!amounts.length) return "";

  // Na linha de totais, o último valor monetário é o "Valor Total da Nota"
  const parsed = amounts.map((a) => parseBrMoney(a)).filter(Boolean);
  const numeric = parsed.map((p) => Number(p)).filter((n) => n > 0);
  if (!numeric.length) return parseBrMoney(amounts[amounts.length - 1]);
  return Math.max(...numeric).toFixed(2);
};

/** NFS-e Foz do Iguaçu / Gestão ISS (layout ImprimeNFSE). */
export function parseNfseFozGestaoIss(text: string): Partial<InvoicePdfExtracted> {
  const lines = linesOf(text);
  const joined = lines.join("\n");

  if (!/NOTA FISCAL DE SERVI[ÇC]OS|ELETR[ÔO]NICA\s*-\s*NFS-?e/i.test(joined)) {
    return {};
  }

  const provider_name = sectionValueAfterLabel(
    lines,
    /^PRESTADOR DE SERVI[ÇC]OS$/i,
    /^Raz[aã]o Social$/i
  );

  const client_name = sectionValueAfterLabel(
    lines,
    /^TOMADOR DE SERVI[ÇC]OS$/i,
    /^Nome\/Raz[aã]o Social$/i
  );

  let issue_date = "";
  const emissaoLineIdx = lines.findIndex((l) => /^Emiss[aã]o/i.test(l));
  if (emissaoLineIdx >= 0) {
    for (let i = emissaoLineIdx; i <= emissaoLineIdx + 2 && i < lines.length; i++) {
      const iso = parseBrDateToIso(lines[i]);
      if (iso) {
        issue_date = iso;
        break;
      }
    }
  }
  if (!issue_date) {
    issue_date = parseBrDateToIso(joined.match(/Emiss[aã]o[^\n]*\n\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1] || "");
  }

  let due_date = "";
  const compLine = lines.find((l) => /^\d{2}\/\d{4}$/.test(l));
  const compFromBlock = joined.match(/Per[ií]odo de Compet[eê]ncia\s*\n\s*(\d{2})\/(\d{4})/i);
  const compMonth = Number(compLine?.split("/")[0] || compFromBlock?.[1]);
  const compYear = Number(compLine?.split("/")[1] || compFromBlock?.[2]);
  if (compMonth >= 1 && compMonth <= 12 && compYear >= 2000) {
    due_date = lastDayOfMonthIso(compMonth, compYear);
  }

  const amount = extractValorTotalNota(joined);

  const chaveMatch = joined.match(/Chave de Acesso da NFS-e Nacional:\s*(\d{40,})/i);
  let invoice_number = chaveMatch ? extractInvoiceNumberFromChave(chaveMatch[1]) : "";
  if (!invoice_number) {
    invoice_number = joined.match(/N[úu]mero\s*(?:da\s*)?NFS-?e\s*[:\-]?\s*(\d+)/i)?.[1] || "";
  }

  let pix_key = "";
  const pixMatch = joined.match(/PIX\s*(?:EMAIL|CHAVE|E-?MAIL)?\s*:?\s*(\S+@\S+)/i);
  if (pixMatch?.[1]) pix_key = pixMatch[1].trim();

  let description = "";
  const descIdx = lines.findIndex((l) => /^DESCRI[ÇC][AÃ]O DOS SERVI[ÇC]OS$/i.test(l));
  if (descIdx >= 0) {
    for (let i = descIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^(reten|valores|pis|cofins|outras inform)/i.test(line)) break;
      if (line.length > 5 && !/^\d+ - /.test(line)) {
        description = line;
        break;
      }
    }
  }
  if (!description) {
    const servLine = lines.find((l) => /^\d{3,4}\s*-\s*.+CNAE:/i.test(l));
    if (servLine) description = servLine;
  }
  const servicoExtra = lines.find((l) => /^Servi[çc]o de /i.test(l));
  if (servicoExtra) description = description ? `${description} — ${servicoExtra}` : servicoExtra;

  return {
    invoice_number,
    provider_name,
    client_name,
    issue_date,
    due_date,
    amount,
    pix_key,
    payment_method: pix_key ? "pix" : "",
    description,
  };
}

/** Parser genérico (outros layouts de NF). */
export function parseInvoicePdfGeneric(text: string): Partial<InvoicePdfExtracted> {
  const compact = normalizeText(text).replace(/[ \t]+/g, " ");

  const pick = (...patterns: RegExp[]) => {
    for (const p of patterns) {
      const m = text.match(p) || compact.match(p);
      if (m?.[1]) return m[1].trim();
    }
    return "";
  };

  const provider_name = pick(
    /(?:PRESTADOR[\s\S]{0,120}?Raz[aã]o\s*Social\s*\n\s*([^\n]+))/i,
    /(?:Raz[aã]o\s*Social|Fornecedor)\s*[:\-]\s*([^\n\r]+)/i,
    /Emitente\s*[:\-]\s*([^\n\r]+)/i
  );

  const invoice_number = pick(
    /Chave de Acesso[^:]*:\s*(\d{40,})/i,
    /(?:N[úu]mero\s*da\s*NF-e|N[úu]mero\s*da\s*Nota|N[úu]mero\s*NFS-e)\s*[:#\-]?\s*([A-Z0-9.\-\/]+)/i
  );

  const issue_dateRaw = pick(
    /Emiss[aã]o[^\n]*\n\s*(\d{2}[\/.-]\d{2}[\/.-]\d{4})/i,
    /(?:Data\s*de\s*Emiss[aã]o|Emiss[aã]o)\s*[:\-]?\s*(\d{2}[\/.-]\d{2}[\/.-]\d{2,4})/i
  );

  const due_dateRaw = pick(
    /(?:Data\s*de\s*Vencimento|Vencimento)\s*[:\-]?\s*(\d{2}[\/.-]\d{2}[\/.-]\d{2,4})/i
  );

  const amountRaw = pick(
    /Valor\s+Total\s+da\s+Nota[^0-9]*([\d.,]+)/i,
    /(?:Valor\s*Total|Valor\s*da\s*Nota|Valor\s*L[ií]quido)\s*[:\-]?\s*R?\$?\s*([\d.,]+)/i
  );

  const pix_key = pick(/PIX\s*(?:EMAIL|CHAVE)?\s*:?\s*(\S+@\S+)/i);

  let numero = invoice_number;
  if (/^\d{40,}$/.test(numero)) {
    numero = extractInvoiceNumberFromChave(numero);
  }

  return {
    invoice_number: numero,
    provider_name,
    issue_date: parseBrDateToIso(issue_dateRaw),
    due_date: parseBrDateToIso(due_dateRaw),
    amount: parseBrMoney(amountRaw),
    pix_key,
    payment_method: pix_key ? "pix" : "",
    client_name: "",
    description: "",
  };
}

export function parseInvoicePdfText(text: string): InvoicePdfExtracted {
  const nfse = parseNfseFozGestaoIss(text);
  const generic = parseInvoicePdfGeneric(text);

  const merged: InvoicePdfExtracted = {
    invoice_number: nfse.invoice_number || generic.invoice_number || "",
    provider_name: nfse.provider_name || generic.provider_name || "",
    client_name: nfse.client_name || generic.client_name || "",
    issue_date: nfse.issue_date || generic.issue_date || "",
    due_date: nfse.due_date || generic.due_date || "",
    amount: nfse.amount || generic.amount || "",
    pix_key: nfse.pix_key || generic.pix_key || "",
    payment_method: nfse.payment_method || generic.payment_method || "",
    description: nfse.description || generic.description || "",
  };

  return merged;
}
