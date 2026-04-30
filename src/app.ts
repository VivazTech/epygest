import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";
import { supabase } from "./lib/supabase.js";

// Importa direto o parser para evitar o modo debug do index.js (que tenta abrir ./test/data/*)
const loadPdfParse = async () => {
  const mod = await import("pdf-parse/lib/pdf-parse.js");
  return (mod as any).default ?? (mod as any);
};

// ---------- helpers ----------
const toIsoDate = (value: string) => {
  if (!value) return "";
  const normalized = value.replace(/[.-]/g, "/");
  const [d, m, y] = normalized.split("/");
  if (!d || !m || !y) return "";
  const yyyy = y.length === 2 ? `20${y}` : y;
  return `${yyyy.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
};

const toAmount = (value: string) => {
  if (!value) return "";
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) return "";
  return parsed.toFixed(2);
};

const escapeCsv = (value: any) => {
  const str = value === null || value === undefined ? "" : String(value);
  return `"${str.replace(/"/g, '""')}"`;
};

const toNumberOrZero = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

type ParsedNode = {
  hierarchyCode: string;
  hierarchyLevel: number;
  label: string;
  numericCode: string;
};

type SintaseRow = {
  id: number;
  crd: string;
  grupo: string;
  detalhado: string;
  months: number[];
  total: number;
};

type CrdMonthlyValueRow = {
  crd_id: number;
  year: number;
  month: number;
  value: number;
};

type PrevRealMonth = {
  previsto: number;
  realizado: number;
  diferenca: number;
};

type PrevRealRow = {
  id: number;
  crd: string;
  grupo: string;
  detalhado: string;
  months: PrevRealMonth[];
  total_previsto: number;
  total_realizado: number;
  total_diferenca: number;
};

const getNormalizedOccupancyPercent = (value: any) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 100;
  if (parsed < 0) return 0;
  if (parsed > 100) return 100;
  return parsed;
};

const normalizeCrdFilterText = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^crd\s+/, "")
    .trim();

const parseHierarchyLine = (raw: string): ParsedNode | null => {
  const normalized = raw.replace(/\s+/g, " ").trim();
  const match = normalized.match(/^([\d.]+)\s*-\s*(.*?)\s*\((\d+)\)\s*$/);
  if (!match) return null;

  const hierarchyCode = match[1].trim();
  const label = match[2].trim();
  const numericCode = match[3].trim();
  return {
    hierarchyCode,
    hierarchyLevel: hierarchyCode.split(".").filter(Boolean).length,
    label,
    numericCode,
  };
};

const getAncestors = (code: string): string[] => {
  const parts = code.split(".").filter(Boolean);
  const ancestors: string[] = [];
  for (let i = parts.length - 1; i >= 1; i -= 1) {
    ancestors.push(parts.slice(0, i).join("."));
  }
  return ancestors;
};

const sanitizeMonthBudget = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getMonthDateRange = (year: number, month: number) => {
  const safeYear = Number.isFinite(year) ? year : new Date().getFullYear();
  const safeMonth = Number.isFinite(month) && month >= 1 && month <= 12 ? month : new Date().getMonth() + 1;
  const lastDay = new Date(safeYear, safeMonth, 0).getDate();
  const monthText = String(safeMonth).padStart(2, "0");
  return {
    dateFrom: `${safeYear}-${monthText}-01`,
    dateTo: `${safeYear}-${monthText}-${String(lastDay).padStart(2, "0")}`,
  };
};

// Diretório de upload: /tmp no Vercel (serverless), local no dev
const uploadDir = process.env.VERCEL
  ? "/tmp/uploads"
  : path.resolve("uploads");

export function createApp() {
  const app = express();

  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const upload = multer({ dest: uploadDir });

  app.use(express.json());
  app.use("/uploads", express.static(uploadDir));

  // ====================================================
  // AUTH
  // ====================================================
  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .eq("password", password)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: "Credenciais inválidas" });
    }
    const { password: _pwd, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  });

  app.get("/api/users", async (_req, res) => {
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, role, sector_id, created_at, sectors(name)")
      .order("name");

    if (error) return res.status(500).json({ error: error.message });

    res.json(
      (data ?? []).map((user: any) => ({
        ...user,
        sector_name: user.sectors?.name ?? null,
        sectors: undefined,
      }))
    );
  });

  app.post("/api/users", async (req, res) => {
    const { name, email, password, role, sector_id } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      role?: "admin" | "finance" | "manager" | "viewer";
      sector_id?: number | null;
    };

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "name, email, password e role são obrigatórios" });
    }

    if (!["admin", "finance", "manager", "viewer"].includes(role)) {
      return res.status(400).json({ error: "role inválido" });
    }

    const { data, error } = await supabase
      .from("users")
      .insert({
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        password: String(password),
        role,
        sector_id: Number.isFinite(Number(sector_id)) ? Number(sector_id) : null,
      })
      .select("id")
      .single();

    if (error) return res.status(400).json({ error: "Não foi possível criar usuário (email duplicado?)" });
    res.json({ id: data.id });
  });

  app.patch("/api/users/:id", async (req, res) => {
    const { id } = req.params;
    const { name, email, password, role, sector_id } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      role?: "admin" | "finance" | "manager" | "viewer";
      sector_id?: number | null;
    };

    if (!name || !email || !role) {
      return res.status(400).json({ error: "name, email e role são obrigatórios" });
    }
    if (!["admin", "finance", "manager", "viewer"].includes(role)) {
      return res.status(400).json({ error: "role inválido" });
    }

    const payload: any = {
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      role,
      sector_id: Number.isFinite(Number(sector_id)) ? Number(sector_id) : null,
    };
    if (password && String(password).trim()) payload.password = String(password);

    const { error } = await supabase
      .from("users")
      .update(payload)
      .eq("id", Number(id));

    if (error) return res.status(400).json({ error: "Não foi possível atualizar usuário" });
    res.json({ success: true });
  });

  // ====================================================
  // DASHBOARD
  // ====================================================
  app.get("/api/supabase/health", async (_req, res) => {
    const startedAt = Date.now();
    const { error, count } = await supabase
      .from("sectors")
      .select("id", { head: true, count: "exact" });

    if (error) {
      return res.status(500).json({
        ok: false,
        message: "Falha ao conectar no Supabase",
        error: error.message,
        latency_ms: Date.now() - startedAt,
      });
    }

    res.json({
      ok: true,
      message: "Conexão com Supabase ativa",
      latency_ms: Date.now() - startedAt,
      sectors_count: count ?? 0,
      checked_at: new Date().toISOString(),
    });
  });

  app.get("/api/dashboard/indicators", async (req, res) => {
    const { month, year } = req.query as { month?: string; year?: string };

    const now = new Date();
    const m = month ? month.padStart(2, "0") : String(now.getMonth() + 1).padStart(2, "0");
    const y = year ?? String(now.getFullYear());
    const dateFrom = `${y}-${m}-01`;
    const dateTo = `${y}-${m}-31`;

    const [{ data: allRevenue }, { data: allExpenses }, { data: monthRevenue }] =
      await Promise.all([
        supabase.from("financial_records").select("amount").eq("type", "revenue"),
        supabase.from("financial_records").select("amount").eq("type", "expense"),
        supabase
          .from("financial_records")
          .select("amount")
          .eq("type", "revenue")
          .gte("date", dateFrom)
          .lte("date", dateTo),
      ]);

    const totalRevenue = (allRevenue ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
    const totalExpenses = (allExpenses ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
    const monthlyRevenue = (monthRevenue ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);

    res.json({
      receitaMensal: monthlyRevenue,
      receitaAcumulada: totalRevenue,
      faturamentoMensal: monthlyRevenue * 1.1,
      faturamentoAcumulado: totalRevenue * 1.1,
      saldo: totalRevenue - totalExpenses,
      lucro: (totalRevenue - totalExpenses) * 0.8,
      crescimento: 12.5,
      cac: 450.0,
      ticketMedio: 1250.0,
      investimentos: 15,
      estoque: 450000,
      ncg: 120000,
      caixaMinimo: 80000,
      pontoEquilibrio: 180000,
    });
  });

  // ====================================================
  // FINANCIAL RECORDS
  // ====================================================
  app.get("/api/financial/records", async (_req, res) => {
    const { data, error } = await supabase
      .from("financial_records")
      .select("*, categories(name), sectors(name)")
      .order("date", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const records = (data ?? []).map((r: any) => ({
      ...r,
      category_name: r.categories?.name ?? null,
      sector_name: r.sectors?.name ?? null,
      categories: undefined,
      sectors: undefined,
    }));
    res.json(records);
  });

  // ====================================================
  // SECTORS
  // ====================================================
  app.get("/api/sectors", async (req, res) => {
    const { month, year } = req.query as { month?: string; year?: string };
    const now = new Date();
    const selectedMonth = Number(month) || now.getMonth() + 1;
    const selectedYear = Number(year) || now.getFullYear();
    const { dateFrom, dateTo } = getMonthDateRange(selectedYear, selectedMonth);

    const { data: sectors, error } = await supabase
      .from("sectors")
      .select("*")
      .order("name");

    if (error) return res.status(500).json({ error: error.message });

    const { data: crdData, error: crdError } = await supabase
      .from("crds")
      .select("id, code, sector_id, previsto_mes")
      .eq("active", true);
    if (crdError) return res.status(500).json({ error: crdError.message });

    const { data: allCrds } = await supabase
      .from("crds")
      .select("id, code, sector_id");

    let occupancyPercent = 100;
    const { data: occupancyRows, error: occupancyError } = await supabase
      .from("sintase_occupancy")
      .select("occupancy_percent")
      .eq("year", selectedYear)
      .limit(1);
    if (!occupancyError && occupancyRows?.length) {
      occupancyPercent = getNormalizedOccupancyPercent((occupancyRows[0] as any).occupancy_percent);
    }
    const occupancyFactor = occupancyPercent / 100;

    const crdIds = (crdData ?? []).map((item: any) => Number(item.id)).filter((id) => Number.isFinite(id));
    const monthlyValueByCrdId = new Map<number, number>();
    const crdIdToSectorCodeKey = new Map<number, string>();
    for (const row of allCrds ?? []) {
      const id = Number((row as any).id);
      const sectorId = Number((row as any).sector_id);
      const code = String((row as any).code || "").trim();
      if (!Number.isFinite(id)) continue;
      crdIdToSectorCodeKey.set(id, `${sectorId}|${code}`);
    }
    const monthlyValueBySectorCodeKey = new Map<string, number>();

    if (crdIds.length) {
      const allowedCrdIds = new Set(crdIds);
      const { data: monthlyValues, error: monthlyError } = await supabase
        .from("crd_monthly_values")
        .select("crd_id, value")
        .eq("year", selectedYear)
        .eq("month", selectedMonth)
        .limit(5000);

      if (monthlyError) {
        const isMissingTable =
          monthlyError.message?.toLowerCase().includes("relation") &&
          monthlyError.message?.includes("crd_monthly_values");
        if (!isMissingTable) return res.status(500).json({ error: monthlyError.message });
      }

      for (const row of monthlyValues ?? []) {
        const crdId = Number((row as any).crd_id);
        if (!allowedCrdIds.has(crdId)) continue;
        const value = sanitizeMonthBudget((row as any).value);
        monthlyValueByCrdId.set(crdId, value);
        const sectorCodeKey = crdIdToSectorCodeKey.get(crdId);
        if (sectorCodeKey) monthlyValueBySectorCodeKey.set(sectorCodeKey, value);
      }
    }

    const budgetBySectorId = new Map<number, number>();
    for (const crd of crdData ?? []) {
      const crdId = Number((crd as any).id);
      const sectorId = Number((crd as any).sector_id);
      const code = String((crd as any).code || "").trim();
      const sectorCodeKey = `${sectorId}|${code}`;
      const defaultValue = sanitizeMonthBudget((crd as any).previsto_mes);
      const monthlyValue = monthlyValueByCrdId.get(crdId) ?? monthlyValueBySectorCodeKey.get(sectorCodeKey);
      const baseValue = monthlyValue ?? defaultValue;
      const effectiveValue = baseValue * occupancyFactor;
      budgetBySectorId.set(sectorId, (budgetBySectorId.get(sectorId) || 0) + effectiveValue);
    }

    const enriched = await Promise.all(
      (sectors ?? []).map(async (sector: any) => {
        const [{ data: pendingInvoices }, { data: pendingReqs }] = await Promise.all([
          supabase
            .from("invoices")
            .select("amount")
            .eq("sector_id", sector.id)
            .gte("due_date", dateFrom)
            .lte("due_date", dateTo)
            .or("flow_stage.is.null,flow_stage.neq.cancelled"),
          supabase
            .from("requisitions")
            .select("amount")
            .eq("sector_id", sector.id)
            .eq("status", "open")
            .gte("date", dateFrom)
            .lte("date", dateTo),
        ]);

        const pending_invoices = (pendingInvoices ?? []).reduce(
          (s: number, i: any) => s + Number(i.amount), 0
        );
        const pending_requisitions = (pendingReqs ?? []).reduce(
          (s: number, r: any) => s + Number(r.amount), 0
        );

        return {
          ...sector,
          pending_invoices,
          pending_requisitions,
          pending_amount: pending_invoices + pending_requisitions,
          budget_month: budgetBySectorId.get(Number(sector.id)) || 0,
          budget_month_ref: {
            month: selectedMonth,
            year: selectedYear,
          },
        };
      })
    );
    res.json(enriched);
  });

  // ====================================================
  // REQUISIÇÕES
  // ====================================================
  app.get("/api/requisitions", async (_req, res) => {
    const { data, error } = await supabase
      .from("requisitions")
      .select("*, sectors(name), crds(id, code, name, sector_id, sectors(name))")
      .order("date", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    res.json(
      (data ?? []).map((r: any) => ({
        ...r,
        sector_name: r.crds?.sectors?.name ?? r.sectors?.name ?? null,
        crd_name: r.crds?.name ?? null,
        crd_code: r.crds?.code ?? null,
        sectors: undefined,
        crds: undefined,
      }))
    );
  });

  app.post("/api/requisitions", async (req, res) => {
    const { crd_id, description, amount, date } = req.body;
    if (!crd_id || !amount || !date)
      return res.status(400).json({ error: "crd_id, amount e date são obrigatórios" });

    const { data: crd, error: crdError } = await supabase
      .from("crds")
      .select("id, sector_id")
      .eq("id", Number(crd_id))
      .single();
    if (crdError || !crd) {
      return res.status(400).json({ error: "CRD inválido para a requisição" });
    }

    const { data, error } = await supabase
      .from("requisitions")
      .insert({
        crd_id: Number(crd_id),
        sector_id: Number(crd.sector_id),
        description: description || null,
        amount,
        date,
        status: "open",
      })
      .select("id")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ id: data.id });
  });

  app.patch("/api/requisitions/:id/status", async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!["open", "cancelled", "posted"].includes(status))
      return res.status(400).json({ error: "Status inválido" });

    const { error } = await supabase.from("requisitions").update({ status }).eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // ====================================================
  // INVOICES
  // ====================================================
  app.get("/api/invoices", async (req, res) => {
    const { month, year } = req.query as { month?: string; year?: string };
    const now = new Date();
    const selectedMonth = Number(month) || now.getMonth() + 1;
    const selectedYear = Number(year) || now.getFullYear();
    const { dateFrom, dateTo } = getMonthDateRange(selectedYear, selectedMonth);

    const { data, error } = await supabase
      .from("invoices")
      .select("*, sectors(name), users(name)")
      .gte("due_date", dateFrom)
      .lte("due_date", dateTo)
      .order("due_date", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    res.json(
      (data ?? []).map((i: any) => ({
        ...i,
        sector_name: i.sectors?.name ?? null,
        user_name: i.users?.name ?? null,
        sectors: undefined,
        users: undefined,
      }))
    );
  });

  // Relatório CSV
  app.get("/api/invoices/report", async (req, res) => {
    const { from, to, payment_method } = req.query as {
      from?: string; to?: string; payment_method?: string;
    };

    let query = supabase
      .from("invoices")
      .select("*, sectors(name)")
      .neq("flow_stage", "cancelled")
      .order("due_date", { ascending: true });

    if (from) query = query.gte("due_date", from);
    if (to) query = query.lte("due_date", to);
    if (payment_method) query = query.eq("payment_method", payment_method);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const rows = (data ?? []).map((i: any) => ({ ...i, sector_name: i.sectors?.name ?? null }));
    const header = [
      "id","invoice_number","provider_name","sector_name","amount",
      "issue_date","due_date","payment_method","pix_key","flow_stage",
      "status","file_path","boleto_file_path","natureza","payment_receipt_path","created_at",
    ];

    const csv = [header.join(","), ...rows.map((r: any) => header.map((k) => escapeCsv(r[k])).join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="relatorio-notas-${Date.now()}.csv"`);
    res.send("\uFEFF" + csv);
  });

  // Upload PDF e extração
  app.post("/api/invoices/extract", upload.single("invoice_pdf"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "PDF não enviado" });

    try {
      const fileBuffer = fs.readFileSync(req.file.path);
      const storagePath = `invoices/${Date.now()}-${req.file.originalname || "nota.pdf"}`;

      const { error: uploadError } = await supabase.storage.from("invoice-files").upload(storagePath, fileBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (uploadError) {
        return res.status(500).json({
          success: false,
          error: `Não foi possível salvar o PDF no storage: ${uploadError.message}`,
        });
      }

      const { data: urlData } = supabase.storage.from("invoice-files").getPublicUrl(storagePath);

      let parseWarning = "";
      let parseErrorDetail = "";
      let invoice_number = "";
      let provider_name = "";
      let issue_dateRaw = "";
      let due_dateRaw = "";
      let amountRaw = "";

      try {
        const pdfParse = await loadPdfParse();
        const parsed = await pdfParse(fileBuffer);
        const text = (parsed.text || "").replace(/\u00A0/g, " ");
        const compactText = text.replace(/[ \t]+/g, " ");

        const pick = (...patterns: RegExp[]) => {
          for (const p of patterns) {
            const m = text.match(p) || compactText.match(p);
            if (m?.[1]) return m[1].trim();
          }
          return "";
        };

        provider_name = pick(
          /(?:Raz[aã]o\s*Social|Fornecedor)\s*[:\-]\s*([^\n\r]+)/i,
          /Emitente\s*[:\-]\s*([^\n\r]+)/i,
          /Prestador\s*[:\-]\s*([^\n\r]+)/i
        );
        invoice_number = pick(
          /(?:N[úu]mero\s*da\s*NF-e|N[úu]mero\s*da\s*Nota|N[úu]mero\s*NFS-e|NF[-\s]?e?|NFS[-\s]?e?)\s*[:#\-]?\s*([A-Z0-9.\-\/]+)/i,
          /(?:N[úu]mero)\s*[:#\-]?\s*([A-Z0-9.\-\/]{3,})/i
        );
        issue_dateRaw = pick(
          /(?:Data\s*de\s*Emiss[aã]o|Emiss[aã]o|Data\s*Emiss[aã]o)\s*[:\-]?\s*(\d{2}[\/.-]\d{2}[\/.-]\d{2,4})/i
        );
        due_dateRaw = pick(
          /(?:Data\s*de\s*Vencimento|Vencimento|Data\s*Vencimento)\s*[:\-]?\s*(\d{2}[\/.-]\d{2}[\/.-]\d{2,4})/i
        );
        amountRaw = pick(
          /(?:Valor\s*Total|Valor\s*da\s*Nota|Valor\s*L[ií]quido|Valor\s*a\s*Pagar|Total)\s*[:\-]?\s*R?\$?\s*([\d.,]+)/i,
          /R\$\s*([\d.]+,\d{2})/i
        );
      } catch (parseError: any) {
        parseWarning = "PDF salvo, mas não foi possível extrair os campos automaticamente. Preencha manualmente.";
        parseErrorDetail = parseError?.message || "Falha desconhecida na leitura do PDF";
      }

      res.json({
        success: true,
        warning: parseWarning || undefined,
        parse_error: parseErrorDetail || undefined,
        extracted: {
          invoice_number,
          provider_name,
          issue_date: toIsoDate(issue_dateRaw),
          due_date: toIsoDate(due_dateRaw),
          amount: toAmount(amountRaw),
        },
        file_path: urlData.publicUrl,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error?.message || "Não foi possível processar o PDF.",
      });
    } finally {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    }
  });

  // Upload comprovante de pagamento
  app.post("/api/invoices/receipt", upload.single("receipt_file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Comprovante não enviado" });

    const allowed = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
    if (!allowed.includes(req.file.mimetype)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Formato inválido. Envie PDF, PNG ou JPG." });
    }

    const fileBuffer = fs.readFileSync(req.file.path);
    const ext = req.file.mimetype.split("/")[1];
    const storagePath = `receipts/${Date.now()}.${ext}`;
    await supabase.storage.from("invoice-files").upload(storagePath, fileBuffer, {
      contentType: req.file.mimetype, upsert: true,
    });
    const { data: urlData } = supabase.storage.from("invoice-files").getPublicUrl(storagePath);
    fs.unlinkSync(req.file.path);
    res.json({ file_path: urlData.publicUrl });
  });

  // Upload boleto
  app.post("/api/invoices/boleto", upload.single("boleto_file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Boleto não enviado" });
    if (req.file.mimetype !== "application/pdf") {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Formato inválido. Envie o boleto em PDF." });
    }

    const fileBuffer = fs.readFileSync(req.file.path);
    const storagePath = `boletos/${Date.now()}.pdf`;
    await supabase.storage.from("invoice-files").upload(storagePath, fileBuffer, {
      contentType: "application/pdf", upsert: true,
    });
    const { data: urlData } = supabase.storage.from("invoice-files").getPublicUrl(storagePath);
    fs.unlinkSync(req.file.path);
    res.json({ file_path: urlData.publicUrl });
  });

  // Criar nota fiscal
  app.post("/api/invoices", async (req, res) => {
    const {
      invoice_number, provider_name, amount, issue_date, due_date,
      sector_id, user_id, file_path, boleto_file_path, natureza,
      crd, payment_method, pix_key,
    } = req.body;

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        invoice_number, provider_name, amount, issue_date, due_date,
        sector_id, user_id,
        file_path: file_path || null,
        boleto_file_path: boleto_file_path || null,
        natureza: natureza || "O",
        crd: crd || null,
        payment_method: payment_method || null,
        pix_key: pix_key || null,
        status: "received",
        flow_stage: "control_pending",
      })
      .select("id")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ id: data.id });
  });

  // Ações de fluxo (aprovar / pagar / cancelar)
  app.patch("/api/invoices/:id/flow", async (req, res) => {
    const { id } = req.params;
    const { action, actorSector, payment_receipt_path, cancel_reason } = req.body as {
      action?: "approve_control" | "mark_paid" | "cancel_request";
      actorSector?: string;
      payment_receipt_path?: string;
      cancel_reason?: string;
    };

    const { data: invoice, error: fetchErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !invoice) return res.status(404).json({ error: "Nota não encontrada" });

    if (action === "approve_control") {
      if ((invoice.flow_stage || "control_pending") !== "control_pending")
        return res.status(400).json({ error: "A nota não está aguardando aprovação do Controle" });
      const { error } = await supabase.from("invoices").update({
        flow_stage: "control_approved",
        approved_at: new Date().toISOString(),
        approved_by_sector: actorSector || "CONTROLE",
      }).eq("id", id);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }

    if (action === "mark_paid") {
      if ((invoice.flow_stage || "control_pending") !== "control_approved")
        return res.status(400).json({ error: "A nota precisa ser aprovada pelo Controle antes do pagamento" });
      const { error } = await supabase.from("invoices").update({
        status: "paid",
        flow_stage: "paid",
        paid_at: new Date().toISOString(),
        paid_by_sector: actorSector || "FINANCEIRO",
        payment_receipt_path: payment_receipt_path || null,
      }).eq("id", id);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }

    if (action === "cancel_request") {
      if (invoice.status === "paid" || invoice.flow_stage === "paid")
        return res.status(400).json({ error: "Não é possível cancelar uma nota já paga" });
      if (invoice.flow_stage === "cancelled")
        return res.status(400).json({ error: "Esta nota já está cancelada" });
      const { error } = await supabase.from("invoices").update({
        flow_stage: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by_sector: actorSector || "SOLICITANTE",
        cancel_reason: cancel_reason || null,
      }).eq("id", id);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }

    res.status(400).json({ error: "Ação inválida" });
  });

  // ====================================================
  // CATEGORIES
  // ====================================================
  app.get("/api/categories", async (_req, res) => {
    const { data, error } = await supabase.from("categories").select("*");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // ====================================================
  // PAYMENT METHODS
  // ====================================================
  app.get("/api/payment-methods", async (_req, res) => {
    const { data, error } = await supabase
      .from("payment_methods")
      .select("*")
      .order("active", { ascending: false })
      .order("name");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.post("/api/payment-methods", async (req, res) => {
    const { key, name, active } = req.body;
    if (!key || !name) return res.status(400).json({ error: "key e name são obrigatórios" });
    const { data, error } = await supabase
      .from("payment_methods")
      .insert({ key, name, active: active !== false })
      .select("id")
      .single();
    if (error) return res.status(400).json({ error: "Não foi possível cadastrar (key duplicada?)" });
    res.json({ id: data.id });
  });

  // ====================================================
  // CRDs
  // ====================================================
  app.get("/api/crds", async (req, res) => {
    const { sector_id } = req.query as { sector_id?: string };

    let query = supabase
      .from("crds")
      .select("*, sectors(name)")
      .order("active", { ascending: false })
      .order("code");

    if (sector_id && Number.isFinite(Number(sector_id)))
      query = query.eq("sector_id", Number(sector_id));

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    res.json(
      (data ?? []).map((r: any) => ({
        ...r,
        sector_name: r.sectors?.name ?? null,
        sectors: undefined,
      }))
    );
  });

  app.post("/api/crds", async (req, res) => {
    const {
      natureza,
      code,
      name,
      sector_id,
      saldo_anterior,
      previsto_mes,
      disponivel_mes,
      realizado_mes,
      saldo,
      active,
    } = req.body;
    if (!natureza || !code || !name || !sector_id)
      return res.status(400).json({ error: "natureza, code, name e sector_id são obrigatórios" });
    const { data, error } = await supabase
      .from("crds")
      .insert({
        natureza: String(natureza).trim().toUpperCase(),
        code,
        name,
        sector_id: Number(sector_id),
        saldo_anterior: toNumberOrZero(saldo_anterior),
        previsto_mes: toNumberOrZero(previsto_mes),
        disponivel_mes: toNumberOrZero(disponivel_mes),
        realizado_mes: toNumberOrZero(realizado_mes),
        saldo: toNumberOrZero(saldo),
        active: active !== false,
      })
      .select("id")
      .single();
    if (error)
      return res.status(400).json({ error: "Não foi possível cadastrar CRD (código já existe neste setor?)" });
    res.json({ id: data.id });
  });

  app.patch("/api/crds/:id", async (req, res) => {
    const { id } = req.params;
    const {
      natureza,
      code,
      name,
      sector_id,
      saldo_anterior,
      previsto_mes,
      disponivel_mes,
      realizado_mes,
      saldo,
      active,
    } = req.body;
    if (!natureza || !code || !name || !sector_id)
      return res.status(400).json({ error: "natureza, code, name e sector_id são obrigatórios" });

    const { error } = await supabase
      .from("crds")
      .update({
        natureza: String(natureza).trim().toUpperCase(),
        code: String(code).trim(),
        name: String(name).trim(),
        sector_id: Number(sector_id),
        saldo_anterior: toNumberOrZero(saldo_anterior),
        previsto_mes: toNumberOrZero(previsto_mes),
        disponivel_mes: toNumberOrZero(disponivel_mes),
        realizado_mes: toNumberOrZero(realizado_mes),
        saldo: toNumberOrZero(saldo),
        active: active !== false,
      })
      .eq("id", Number(id));

    if (error)
      return res.status(400).json({ error: "Não foi possível atualizar CRD (código já existe neste setor?)" });
    res.json({ success: true });
  });

  app.post("/api/crds/import", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Arquivo XLS não enviado" });

    try {
      const workbook = xlsx.readFile(req.file.path);
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json(firstSheet, { header: 1, defval: "" }) as string[][];

      const nodes = rows
        .map((row) => parseHierarchyLine(String(row?.[0] ?? "")))
        .filter((row): row is ParsedNode => Boolean(row));

      if (!nodes.length) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: "Nenhum CRD válido encontrado no arquivo" });
      }

      const parentCodes = new Set<string>();
      for (const node of nodes) {
        for (const ancestor of getAncestors(node.hierarchyCode)) parentCodes.add(ancestor);
      }

      const byHierarchyCode = new Map(nodes.map((n) => [n.hierarchyCode, n]));
      const leaves = nodes.filter((n) => !parentCodes.has(n.hierarchyCode));

      const getGroupName = (leaf: ParsedNode) => {
        const ancestors = getAncestors(leaf.hierarchyCode)
          .map((code) => byHierarchyCode.get(code))
          .filter(Boolean) as ParsedNode[];
        const level2 = ancestors.find((a) => a.hierarchyLevel === 2);
        const level1 = ancestors.find((a) => a.hierarchyLevel === 1);
        return level2?.label || level1?.label || "Sem grupo";
      };

      const groupedCrdRows = leaves.map((leaf) => ({
        code: leaf.numericCode,
        name: leaf.label,
        groupName: getGroupName(leaf),
      }));

      const uniqueGroupNames = [...new Set(groupedCrdRows.map((r) => r.groupName.trim()).filter(Boolean))];
      const { data: existingSectors, error: sectorsError } = await supabase.from("sectors").select("id, name");
      if (sectorsError) throw sectorsError;

      const sectorIdByGroup = new Map<string, number>();
      for (const sector of existingSectors ?? []) {
        sectorIdByGroup.set(String(sector.name).trim().toUpperCase(), Number(sector.id));
      }

      const createdGroups: string[] = [];
      for (const groupName of uniqueGroupNames) {
        const key = groupName.toUpperCase();
        if (sectorIdByGroup.has(key)) continue;

        const { data: created, error: createSectorError } = await supabase
          .from("sectors")
          .insert({ name: groupName, budget_limit: 0 })
          .select("id, name")
          .single();
        if (createSectorError) throw createSectorError;

        sectorIdByGroup.set(String(created.name).trim().toUpperCase(), Number(created.id));
        createdGroups.push(groupName);
      }

      const payload = groupedCrdRows
        .map((row) => ({
          natureza: "O",
          code: row.code,
          name: row.name,
          sector_id: sectorIdByGroup.get(row.groupName.toUpperCase()),
          saldo_anterior: 0,
          previsto_mes: 0,
          disponivel_mes: 0,
          realizado_mes: 0,
          saldo: 0,
          active: true,
        }))
        .filter((row) => Number.isFinite(Number(row.sector_id)));

      const { error: upsertError } = await supabase
        .from("crds")
        .upsert(payload, { onConflict: "code,sector_id", ignoreDuplicates: false });
      if (upsertError) throw upsertError;

      fs.unlinkSync(req.file.path);
      res.json({
        success: true,
        imported: payload.length,
        groups: uniqueGroupNames.length,
        created_groups: createdGroups.length,
      });
    } catch (error: any) {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(500).json({ error: error?.message || "Erro ao importar CRDs" });
    }
  });

  // ====================================================
  // SÍNTASE (VISÃO ANUAL DE ORÇAMENTO POR CRD)
  // ====================================================
  app.get("/api/sintase", async (req, res) => {
    const { year, crd } = req.query as { year?: string; crd?: string };
    const selectedYear = Number(year) || new Date().getFullYear();
    const crdFilter = normalizeCrdFilterText(crd || "");

    let occupancyPercent = 100;
    const { data: occupancyRows, error: occupancyError } = await supabase
      .from("sintase_occupancy")
      .select("occupancy_percent")
      .eq("year", selectedYear)
      .limit(1);
    if (!occupancyError && occupancyRows?.length) {
      occupancyPercent = getNormalizedOccupancyPercent((occupancyRows[0] as any).occupancy_percent);
    }
    const occupancyFactor = occupancyPercent / 100;

    const { data: crdData, error } = await supabase
      .from("crds")
      .select("id, code, name, sector_id, previsto_mes, sectors(name)")
      .eq("active", true)
      .order("code");

    if (error) return res.status(500).json({ error: error.message });

    const { data: allCrds } = await supabase
      .from("crds")
      .select("id, code, sector_id");

    const crdIds = (crdData ?? []).map((item: any) => Number(item.id)).filter((id) => Number.isFinite(id));
    const monthValueByKey = new Map<string, number>();
    const crdIdToSectorCodeKey = new Map<number, string>();
    for (const row of allCrds ?? []) {
      const id = Number((row as any).id);
      const sectorId = Number((row as any).sector_id);
      const code = String((row as any).code || "").trim();
      if (!Number.isFinite(id)) continue;
      crdIdToSectorCodeKey.set(id, `${sectorId}|${code}`);
    }
    const monthValueBySectorCodeKey = new Map<string, number>();

    if (crdIds.length) {
      const allowedCrdIds = new Set(crdIds);
      const { data: monthlyRows, error: monthlyError } = await supabase
        .from("crd_monthly_values")
        .select("crd_id, year, month, value")
        .eq("year", selectedYear)
        .limit(5000);

      if (!monthlyError) {
        for (const row of (monthlyRows ?? []) as CrdMonthlyValueRow[]) {
          if (!allowedCrdIds.has(Number(row.crd_id))) continue;
          const value = sanitizeMonthBudget(row.value);
          monthValueByKey.set(`${row.crd_id}:${row.month}`, value);
          const sectorCodeKey = crdIdToSectorCodeKey.get(Number(row.crd_id));
          if (sectorCodeKey) monthValueBySectorCodeKey.set(`${sectorCodeKey}:${row.month}`, value);
        }
      }
    }

    const rows = (crdData ?? [])
      .map((item: any) => {
        const monthlyBudget = sanitizeMonthBudget(item.previsto_mes);
        const crdId = Number(item.id);
        const sectorId = Number(item.sector_id);
        const code = String(item.code || "").trim();
        const months = Array.from({ length: 12 }, (_, monthIndex) => {
          const monthNumber = monthIndex + 1;
          const override =
            monthValueByKey.get(`${crdId}:${monthNumber}`) ??
            monthValueBySectorCodeKey.get(`${sectorId}|${code}:${monthNumber}`);
          const baseValue = override ?? monthlyBudget;
          return baseValue * occupancyFactor;
        });
        const total = months.reduce((sum, monthValue) => sum + monthValue, 0);

        const row: SintaseRow = {
          id: Number(item.id),
          // CRD = nome macro (ex.: A&B, RH) vindo do setor.
          crd: String(item.sectors?.name || "Sem CRD"),
          // Grupo = código curto (1-2 dígitos) cadastrado no campo code.
          grupo: String(item.code || ""),
          detalhado: String(item.name || ""),
          months,
          total,
        };
        return row;
      })
      .filter((row) => {
        if (!crdFilter) return true;
        const normalizedRowCrd = normalizeCrdFilterText(row.crd);
        return (
          normalizedRowCrd.includes(crdFilter) ||
          row.detalhado.toLowerCase().includes(crdFilter) ||
          row.grupo.toLowerCase().includes(crdFilter)
        );
      });

    const monthlyTotals = Array.from({ length: 12 }, (_, monthIndex) =>
      rows.reduce((sum, row) => sum + (row.months[monthIndex] || 0), 0)
    );
    const grandTotal = monthlyTotals.reduce((sum, monthValue) => sum + monthValue, 0);

    res.json({
      year: selectedYear,
      filters: {
        crd: crdFilter || null,
      },
      occupancy_percent: occupancyPercent,
      rows,
      totals: {
        months: monthlyTotals,
        total: grandTotal,
      },
    });
  });

  app.patch("/api/sintase/cell", async (req, res) => {
    const { crd_id, month, year, value, occupancy_percent } = req.body as {
      crd_id?: number;
      month?: number;
      year?: number;
      value?: number | string;
      occupancy_percent?: number | string;
    };

    if (!Number.isFinite(Number(crd_id))) {
      return res.status(400).json({ error: "crd_id inválido" });
    }
    if (!Number.isFinite(Number(month)) || Number(month) < 1 || Number(month) > 12) {
      return res.status(400).json({ error: "month deve estar entre 1 e 12" });
    }
    if (!Number.isFinite(Number(year))) {
      return res.status(400).json({ error: "year inválido" });
    }

    const occupancyPercent = getNormalizedOccupancyPercent(occupancy_percent ?? 100);
    const occupancyFactor = occupancyPercent / 100;
    const adjustedValue = sanitizeMonthBudget(value);
    const sanitizedValue = occupancyFactor > 0 ? adjustedValue / occupancyFactor : 0;
    const { error } = await supabase
      .from("crd_monthly_values")
      .upsert(
        {
          crd_id: Number(crd_id),
          year: Number(year),
          month: Number(month),
          value: sanitizedValue,
        },
        { onConflict: "crd_id,year,month" }
      );

    if (error) {
      if (error.message?.toLowerCase().includes("relation") && error.message?.includes("crd_monthly_values")) {
        return res.status(500).json({
          error:
            "Tabela crd_monthly_values não encontrada. Execute a migração SQL de valores mensais da Síntase.",
        });
      }
      return res.status(500).json({ error: error.message });
    }

    res.json({
      success: true,
      saved: {
        crd_id: Number(crd_id),
        month: Number(month),
        year: Number(year),
        value: sanitizedValue,
      },
    });
  });

  app.get("/api/sintase/occupancy", async (req, res) => {
    const { year } = req.query as { year?: string };
    const selectedYear = Number(year) || new Date().getFullYear();
    const { data, error } = await supabase
      .from("sintase_occupancy")
      .select("year, occupancy_percent")
      .eq("year", selectedYear)
      .limit(1);
    if (error) return res.status(500).json({ error: error.message });
    const occupancyPercent = data?.length
      ? getNormalizedOccupancyPercent((data[0] as any).occupancy_percent)
      : 100;
    res.json({ year: selectedYear, occupancy_percent: occupancyPercent });
  });

  app.patch("/api/sintase/occupancy", async (req, res) => {
    const { year, occupancy_percent } = req.body as { year?: number | string; occupancy_percent?: number | string };
    if (!Number.isFinite(Number(year))) {
      return res.status(400).json({ error: "year inválido" });
    }
    const occupancyPercent = getNormalizedOccupancyPercent(occupancy_percent ?? 100);
    const { error } = await supabase
      .from("sintase_occupancy")
      .upsert(
        {
          year: Number(year),
          occupancy_percent: occupancyPercent,
        },
        { onConflict: "year" }
      );
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, year: Number(year), occupancy_percent: occupancyPercent });
  });

  app.get("/api/prev-real", async (req, res) => {
    const { year, crd } = req.query as { year?: string; crd?: string };
    const selectedYear = Number(year) || new Date().getFullYear();
    const crdFilter = normalizeCrdFilterText(crd || "");
    const dateFrom = `${selectedYear}-01-01`;
    const dateTo = `${selectedYear}-12-31`;

    let occupancyPercent = 100;
    const { data: occupancyRows, error: occupancyError } = await supabase
      .from("sintase_occupancy")
      .select("occupancy_percent")
      .eq("year", selectedYear)
      .limit(1);
    if (!occupancyError && occupancyRows?.length) {
      occupancyPercent = getNormalizedOccupancyPercent((occupancyRows[0] as any).occupancy_percent);
    }
    const occupancyFactor = occupancyPercent / 100;

    const { data: crdData, error: crdError } = await supabase
      .from("crds")
      .select("id, code, name, previsto_mes, sector_id, sectors(name)")
      .eq("active", true)
      .order("code");
    if (crdError) return res.status(500).json({ error: crdError.message });

    const { data: allCrds } = await supabase
      .from("crds")
      .select("id, code, sector_id");

    const crdIds = (crdData ?? []).map((item: any) => Number(item.id)).filter((id) => Number.isFinite(id));
    const monthValueByKey = new Map<string, number>();
    const crdIdToSectorCodeKey = new Map<number, string>();
    for (const row of allCrds ?? []) {
      const id = Number((row as any).id);
      const sectorId = Number((row as any).sector_id);
      const code = String((row as any).code || "").trim();
      if (!Number.isFinite(id)) continue;
      crdIdToSectorCodeKey.set(id, `${sectorId}|${code}`);
    }
    const monthValueBySectorCodeKey = new Map<string, number>();

    if (crdIds.length) {
      const allowedCrdIds = new Set(crdIds);
      const { data: monthlyRows, error: monthlyError } = await supabase
        .from("crd_monthly_values")
        .select("crd_id, year, month, value")
        .eq("year", selectedYear)
        .limit(5000);

      if (!monthlyError) {
        for (const row of (monthlyRows ?? []) as CrdMonthlyValueRow[]) {
          if (!allowedCrdIds.has(Number(row.crd_id))) continue;
          const value = sanitizeMonthBudget(row.value);
          monthValueByKey.set(`${row.crd_id}:${row.month}`, value);
          const sectorCodeKey = crdIdToSectorCodeKey.get(Number(row.crd_id));
          if (sectorCodeKey) monthValueBySectorCodeKey.set(`${sectorCodeKey}:${row.month}`, value);
        }
      }
    }

    const crdById = new Map<number, any>();
    const crdBySectorAndCode = new Map<string, number>();
    for (const c of crdData ?? []) {
      const id = Number((c as any).id);
      const sectorId = Number((c as any).sector_id);
      const code = String((c as any).code || "").trim();
      crdById.set(id, c);
      crdBySectorAndCode.set(`${sectorId}:${code}`, id);
    }

    const realizedByKey = new Map<string, number>();
    const addRealized = (crdId: number, month: number, amount: any) => {
      if (!Number.isFinite(crdId) || !Number.isFinite(month) || month < 1 || month > 12) return;
      const key = `${crdId}:${month}`;
      realizedByKey.set(key, (realizedByKey.get(key) || 0) + sanitizeMonthBudget(amount));
    };

    const { data: invoiceData, error: invoiceError } = await supabase
      .from("invoices")
      .select("amount, due_date, sector_id, crd, status, flow_stage")
      .gte("due_date", dateFrom)
      .lte("due_date", dateTo)
      .neq("flow_stage", "cancelled");
    if (invoiceError) return res.status(500).json({ error: invoiceError.message });

    for (const invoice of invoiceData ?? []) {
      const date = new Date(String((invoice as any).due_date || ""));
      if (Number.isNaN(date.getTime())) continue;
      const month = date.getMonth() + 1;
      const sectorId = Number((invoice as any).sector_id);
      const code = String((invoice as any).crd || "").trim();
      if (!code || !Number.isFinite(sectorId)) continue;
      const crdId = crdBySectorAndCode.get(`${sectorId}:${code}`);
      if (!crdId) continue;
      addRealized(crdId, month, (invoice as any).amount);
    }

    const { data: reqData, error: reqError } = await supabase
      .from("requisitions")
      .select("amount, date, status, crd_id")
      .eq("status", "posted")
      .gte("date", dateFrom)
      .lte("date", dateTo);
    if (reqError) return res.status(500).json({ error: reqError.message });

    for (const reqRow of reqData ?? []) {
      const date = new Date(String((reqRow as any).date || ""));
      if (Number.isNaN(date.getTime())) continue;
      const month = date.getMonth() + 1;
      const crdId = Number((reqRow as any).crd_id);
      addRealized(crdId, month, (reqRow as any).amount);
    }

    const rows = (crdData ?? [])
      .map((item: any) => {
        const crdId = Number(item.id);
        const sectorId = Number(item.sector_id);
        const code = String(item.code || "").trim();
        const monthlyBudget = sanitizeMonthBudget(item.previsto_mes);
        const months: PrevRealMonth[] = Array.from({ length: 12 }, (_, monthIndex) => {
          const month = monthIndex + 1;
          const override =
            monthValueByKey.get(`${crdId}:${month}`) ??
            monthValueBySectorCodeKey.get(`${sectorId}|${code}:${month}`);
          const basePrevisto = override ?? monthlyBudget;
          const previsto = basePrevisto * occupancyFactor;
          const realizado = realizedByKey.get(`${crdId}:${month}`) || 0;
          const diferenca = previsto - realizado;
          return { previsto, realizado, diferenca };
        });
        const total_previsto = months.reduce((sum, m) => sum + m.previsto, 0);
        const total_realizado = months.reduce((sum, m) => sum + m.realizado, 0);
        const total_diferenca = total_previsto - total_realizado;
        const row: PrevRealRow = {
          id: crdId,
          crd: String(item.sectors?.name || "Sem CRD"),
          grupo: String(item.code || ""),
          detalhado: String(item.name || ""),
          months,
          total_previsto,
          total_realizado,
          total_diferenca,
        };
        return row;
      })
      .filter((row) => {
        if (!crdFilter) return true;
        const normalizedRowCrd = normalizeCrdFilterText(row.crd);
        return (
          normalizedRowCrd.includes(crdFilter) ||
          row.grupo.toLowerCase().includes(crdFilter) ||
          row.detalhado.toLowerCase().includes(crdFilter)
        );
      });

    const totals = {
      months: Array.from({ length: 12 }, (_, monthIndex) => {
        const previsto = rows.reduce((sum, row) => sum + (row.months[monthIndex]?.previsto || 0), 0);
        const realizado = rows.reduce((sum, row) => sum + (row.months[monthIndex]?.realizado || 0), 0);
        return { previsto, realizado, diferenca: previsto - realizado };
      }),
      previsto: rows.reduce((sum, row) => sum + row.total_previsto, 0),
      realizado: rows.reduce((sum, row) => sum + row.total_realizado, 0),
      diferenca: rows.reduce((sum, row) => sum + row.total_diferenca, 0),
    };

    res.json({
      year: selectedYear,
      occupancy_percent: occupancyPercent,
      rows,
      totals,
    });
  });

  // ====================================================
  // SCENARIOS
  // ====================================================
  app.get("/api/scenarios", async (_req, res) => {
    const { data, error } = await supabase.from("scenarios").select("*");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  return app;
}
