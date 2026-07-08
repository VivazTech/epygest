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

const cleanPixKey = (raw: string): string =>
  String(raw || "")
    .trim()
    .replace(/^["'([{]+/, "")
    .replace(/[.,;)\]}"']+$/, "");

/** Extrai chave Pix de texto livre (descrição, observações, etc.). */
export const extractPixKeyFromText = (text: string): string => {
  const source = normalizeText(text).replace(/[ \t]+/g, " ");
  if (!source) return "";
  if (!/pix/i.test(source)) return "";

  const tryPatterns: RegExp[] = [
    // Chave Pix / PIX e-mail: valor@dominio
    /(?:chave\s*)?pix\s*(?:e-?mail|email|chave)?\s*[:\-–]?\s*([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i,
    /(?:chave\s*)?pix\s*[:\-–]\s*([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i,
    // PIX seguido de e-mail (ex.: "PIX pix@empresa.com.br")
    /\bpix\s+([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i,
    // E-mail após menção a pix em até ~100 caracteres
    /\b(?:pix|chave\s*pix)\b[^@\n]{0,100}?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i,
    // Chave aleatória (EVP)
    /(?:chave\s*)?pix\s*[:\-–]?\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    // CPF/CNPJ após PIX
    /(?:chave\s*)?pix\s*(?:cpf|cnpj)?\s*[:\-–]?\s*([\d./-]{11,18})/i,
    // Telefone após PIX
    /(?:chave\s*)?pix\s*(?:telefone|celular|fone)?\s*[:\-–]?\s*(\+?55?\s*\(?\d{2}\)?\s*9?\d{4}[-.\s]?\d{4})/i,
    // Pagamento via PIX: valor genérico
    /(?:pagamento|pgto\.?|via)\s+(?:por\s+)?pix[^:]*[:\-–]\s*(\S+)/i,
    // PIX: qualquer token até vírgula/ponto-e-vírgula (último recurso)
    /(?:chave\s*)?pix\s*[:\-–]?\s*([^\s,;|]{3,})/i,
  ];

  for (const pattern of tryPatterns) {
    const match = source.match(pattern);
    const candidate = cleanPixKey(match?.[1] || "");
    if (!candidate) continue;
    if (/^pix$/i.test(candidate)) continue;
    if (/@/.test(candidate) || /^[\d./+-]+$/.test(candidate) || /^[0-9a-f-]{36}$/i.test(candidate)) {
      return candidate;
    }
    if (candidate.length >= 8) return candidate;
  }

  return "";
};

const resolvePixFromSources = (...sources: string[]): { pix_key: string; payment_method: string } => {
  for (const source of sources) {
    const pix_key = extractPixKeyFromText(source);
    if (pix_key) return { pix_key, payment_method: "pix" };
  }
  return { pix_key: "", payment_method: "" };
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

const extractInvoiceNumberFromText = (lines: string[], joined: string): string => {
  const numeroLabels = [
    /^N[úu]mero\s*(?:da\s*)?NFS-?e$/i,
    /^N[úu]mero\s*da\s*Nota$/i,
    /^N[úu]mero$/i,
    /^N[ºo°]\s*(?:da\s*)?NFS-?e$/i,
  ];
  for (const label of numeroLabels) {
    const idx = lines.findIndex((l) => label.test(l));
    if (idx < 0) continue;
    for (let j = idx + 1; j <= idx + 3 && j < lines.length; j++) {
      const candidate = lines[j].trim();
      if (/^\d{1,15}$/.test(candidate)) return candidate;
    }
  }

  const inlinePatterns = [
    /N[úu]mero\s*(?:da\s*)?NFS-?e\s*[:\-]?\s*(\d+)/i,
    /NFS-?e\s*(?:n[ºo°]\.?)?\s*[:\-]?\s*(\d+)/i,
    /N[úu]mero\s*(?:da\s*)?Nota\s*[:\-]?\s*(\d+)/i,
  ];
  for (const pattern of inlinePatterns) {
    const match = joined.match(pattern);
    if (match?.[1]) return match[1];
  }

  return "";
};

/** Extrai o número da nota da chave preservando zeros à esquerda. */
export const extractInvoiceNumberFromChave = (chave: string): string => {
  const digits = String(chave || "").replace(/\D/g, "");
  if (digits.length < 35) return "";

  const pickField = (start: number, length: number): string => {
    const field = digits.slice(start, start + length);
    if (/^\d+$/.test(field) && !/^0+$/.test(field)) return field;
    return "";
  };

  // NFS-e Nacional — 50 dígitos: número nas posições 24–36 (13 dígitos, base 1)
  if (digits.length >= 50) {
    const numero = pickField(23, 13);
    if (numero) return numero;
  }

  // NF-e — 44 dígitos: número nas posições 26–34 (9 dígitos, base 1)
  if (digits.length >= 44 && digits.length < 50) {
    const numero = pickField(25, 9);
    if (numero) return numero;
  }

  // Layout alternativo usado em alguns emissores municipais (13 dígitos)
  const alt = pickField(22, 13);
  if (alt) return alt;

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
  let invoice_number = extractInvoiceNumberFromText(lines, joined);
  if (!invoice_number && chaveMatch) {
    invoice_number = extractInvoiceNumberFromChave(chaveMatch[1]);
  }

  let pix_key = "";
  const pixMatch = joined.match(/PIX\s*(?:EMAIL|CHAVE|E-?MAIL)?\s*:?\s*(\S+@\S+)/i);
  if (pixMatch?.[1]) pix_key = cleanPixKey(pixMatch[1]);

  let description = "";
  const descIdx = lines.findIndex((l) => /^DESCRI[ÇC][AÃ]O DOS SERVI[ÇC]OS$/i.test(l));
  if (descIdx >= 0) {
    const descParts: string[] = [];
    for (let i = descIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^(reten|valores|pis|cofins|outras inform)/i.test(line)) break;
      if (line.length > 3 && !/^\d+ - /.test(line)) {
        descParts.push(line);
      }
    }
    description = descParts.join(" ");
  }
  if (!description) {
    const servLine = lines.find((l) => /^\d{3,4}\s*-\s*.+CNAE:/i.test(l));
    if (servLine) description = servLine;
  }
  const servicoExtra = lines.find((l) => /^Servi[çc]o de /i.test(l));
  if (servicoExtra) description = description ? `${description} — ${servicoExtra}` : servicoExtra;

  if (!pix_key) {
    const fromPix = resolvePixFromSources(description, joined);
    pix_key = fromPix.pix_key;
  }

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
  const lines = linesOf(text);

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

  const invoice_numberRaw = pick(
    /N[úu]mero\s*(?:da\s*)?NFS-?e\s*[:\-]?\s*(\d+)/i,
    /(?:N[úu]mero\s*da\s*NF-e|N[úu]mero\s*da\s*Nota|N[úu]mero\s*NFS-e)\s*[:#\-]?\s*(\d+)/i,
    /Chave de Acesso[^:]*:\s*(\d{40,})/i
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

  const pix_keyRaw = pick(/PIX\s*(?:EMAIL|CHAVE)?\s*:?\s*(\S+@\S+)/i);
  const pix_key = cleanPixKey(pix_keyRaw);

  let numero = invoice_numberRaw || extractInvoiceNumberFromText(lines, text);
  if (/^\d{40,}$/.test(numero)) {
    numero = extractInvoiceNumberFromChave(numero);
  }

  const description = pick(
    /DESCRI[ÇC][AÃ]O\s*(?:DOS\s*SERVI[ÇC]OS)?\s*[:\-]?\s*([^\n]+)/i,
    /(?:Discrimina[çc][aã]o|Servi[çc]o\s*Prestado)\s*[:\-]?\s*([^\n]+)/i
  );

  const pixResolved = pix_key
    ? { pix_key, payment_method: "pix" as const }
    : resolvePixFromSources(description, text);

  return {
    invoice_number: numero,
    provider_name,
    issue_date: parseBrDateToIso(issue_dateRaw),
    due_date: parseBrDateToIso(due_dateRaw),
    amount: parseBrMoney(amountRaw),
    pix_key: pixResolved.pix_key,
    payment_method: pixResolved.payment_method,
    client_name: "",
    description,
  };
}

/** Parser para DANFE (NF-e — Documento Auxiliar da Nota Fiscal Eletrônica). */
export function parseDanfePdfText(text: string): Partial<InvoicePdfExtracted> {
  const compact = normalizeText(text).replace(/[ \t]+/g, " ");
  const lines = linesOf(text);

  if (!/\bDANFE\b/i.test(compact) && !/DOCUMENTO AUXILIAR DA NOTA FISCAL/i.test(compact)) {
    return {};
  }

  // Número da nota: "Nº: 000.078.214" or from chave
  let invoice_number = "";
  const numMatch = compact.match(/N[ºo°]\s*[:\-]?\s*([\d.]+)/i);
  if (numMatch?.[1]) {
    invoice_number = numMatch[1].replace(/\./g, "");
  }

  // Remove leading zeros after stripping dots
  if (/^0+\d/.test(invoice_number)) {
    invoice_number = String(parseInt(invoice_number, 10));
  }

  // Provider name: from "RECEBEMOS DE <name> OS PRODUTOS" sentence (most reliable)
  let provider_name = "";
  const recebemosMatch = compact.match(/RECEBEMOS DE ([A-ZÁÉÍÓÚÂÊÎÔÛÃÕA-Z][A-ZÁÉÍÓÚÂÊÎÔÛÃÕA-Za-z\s]+?) OS PRODUTOS/i);
  if (recebemosMatch?.[1]) {
    provider_name = recebemosMatch[1].trim();
  } else {
    // Fallback: look for emitente name block before the DANFE line
    const danfeLineIdx = lines.findIndex((l) => /^DANFE$/i.test(l));
    if (danfeLineIdx > 0) {
      for (let i = danfeLineIdx - 1; i >= Math.max(0, danfeLineIdx - 10); i--) {
        const l = lines[i];
        if (/^(AV|RUA|BAIRRO|CEP|FONE|NF-e|N[ºo°]|SÉRIE|RECEBEMOS)/i.test(l)) continue;
        if (l.length > 5 && /[A-ZÁÉÍÓÚÂÊÎÔÛÃÕ]{3,}/.test(l) && !/^\d/.test(l)) {
          // Check if it's a company name fragment (e.g. "LTDA") — join with prior line
          if (/^(LTDA|ME|EPP|EIRELI|S\.A\.?|SA)$/i.test(l) && i > 0) {
            provider_name = lines[i - 1].trim() + " " + l;
          } else {
            provider_name = l;
          }
          break;
        }
      }
    }
  }

  // CNPJ emitente
  const cnpjMatch = compact.match(/CNPJ\s+([\d]{2}\.[\d]{3}\.[\d]{3}\/[\d]{4}-[\d]{2})/);
  const cnpj_emitente = cnpjMatch?.[1] || "";

  // Chave de acesso: 44-digit groups
  const chaveRaw = compact.match(/CHAVE DE ACESSO\s+([\d\s]{44,58})/i);
  const chave_acesso = chaveRaw ? chaveRaw[1].replace(/\s/g, "").slice(0, 44) : "";

  // If no invoice_number from Nº field, extract from chave
  if (!invoice_number && chave_acesso.length === 44) {
    invoice_number = extractInvoiceNumberFromChave(chave_acesso);
  }

  // Issue date from "DATA EMISSÃO" label
  const emissaoIdx = lines.findIndex((l) => /DATA\s*EMISS[AÃ]O/i.test(l));
  let issue_date = "";
  if (emissaoIdx >= 0) {
    for (let i = emissaoIdx; i <= emissaoIdx + 3 && i < lines.length; i++) {
      const iso = parseBrDateToIso(lines[i]);
      if (iso) { issue_date = iso; break; }
    }
  }

  // Due date from "FATURA / DUPLICATA" block — first vencimento date
  let due_date = "";
  const faturaIdx = lines.findIndex((l) => /FATURA\s*[\/|]\s*DUPLICATA/i.test(l));
  if (faturaIdx >= 0) {
    for (let i = faturaIdx + 1; i <= faturaIdx + 10 && i < lines.length; i++) {
      const iso = parseBrDateToIso(lines[i]);
      if (iso) { due_date = iso; break; }
    }
  }

  // Valor total da nota
  let amount = "";
  const valorTotalIdx = lines.findIndex((l) => /VALOR\s+TOTAL\s+DA\s+NOTA/i.test(l));
  if (valorTotalIdx >= 0) {
    for (let i = valorTotalIdx; i <= valorTotalIdx + 3 && i < lines.length; i++) {
      const parsed = parseBrMoney(lines[i]);
      if (parsed) { amount = parsed; break; }
    }
  }
  if (!amount) {
    const m = compact.match(/VALOR\s+TOTAL\s+DA\s+NOTA\s+([\d.,]+)/i);
    if (m?.[1]) amount = parseBrMoney(m[1]);
  }

  return {
    invoice_number,
    provider_name,
    client_name: "VIVAZ CATARATAS",
    issue_date,
    due_date,
    amount,
    pix_key: "",
    payment_method: "boleto",
    description: cnpj_emitente ? `CNPJ: ${cnpj_emitente}${chave_acesso ? ` | Chave: ${chave_acesso}` : ""}` : "",
  };
}

export function parseInvoicePdfText(text: string): InvoicePdfExtracted {
  // Auto-detect DANFE before trying NFS-e parsers
  const isDanfe = /\bDANFE\b/i.test(text) || /DOCUMENTO AUXILIAR DA NOTA FISCAL ELETR[ÔO]NICA/i.test(text);
  if (isDanfe) {
    const danfe = parseDanfePdfText(text);
    const merged: InvoicePdfExtracted = {
      invoice_number: danfe.invoice_number || "",
      provider_name: danfe.provider_name || "",
      client_name: danfe.client_name || "",
      issue_date: danfe.issue_date || "",
      due_date: danfe.due_date || "",
      amount: danfe.amount || "",
      pix_key: danfe.pix_key || "",
      payment_method: danfe.payment_method || "boleto",
      description: danfe.description || "",
    };
    return merged;
  }

  const nfse = parseNfseFozGestaoIss(text);
  const generic = parseInvoicePdfGeneric(text);

  const description = nfse.description || generic.description || "";
  let pix_key = nfse.pix_key || generic.pix_key || "";
  let payment_method = nfse.payment_method || generic.payment_method || "";

  if (!pix_key) {
    const fromText = resolvePixFromSources(description, text);
    pix_key = fromText.pix_key;
    if (pix_key) payment_method = "pix";
  }

  const merged: InvoicePdfExtracted = {
    invoice_number: nfse.invoice_number || generic.invoice_number || "",
    provider_name: nfse.provider_name || generic.provider_name || "",
    client_name: nfse.client_name || generic.client_name || "",
    issue_date: nfse.issue_date || generic.issue_date || "",
    due_date: nfse.due_date || generic.due_date || "",
    amount: nfse.amount || generic.amount || "",
    pix_key,
    payment_method,
    description,
  };

  return merged;
}
