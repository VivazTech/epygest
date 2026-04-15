import express from "express";
import multer from "multer";
import * as pdfParseModule from "pdf-parse";
import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";
import { supabase } from "./lib/supabase.ts";

const pdfParse = (pdfParseModule as any).default ?? (pdfParseModule as any);

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

type ParsedNode = {
  hierarchyCode: string;
  hierarchyLevel: number;
  label: string;
  numericCode: string;
};

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

  // ====================================================
  // DASHBOARD
  // ====================================================
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
  app.get("/api/sectors", async (_req, res) => {
    const { data: sectors, error } = await supabase
      .from("sectors")
      .select("*")
      .order("name");

    if (error) return res.status(500).json({ error: error.message });

    const enriched = await Promise.all(
      (sectors ?? []).map(async (sector: any) => {
        const [{ data: pendingInvoices }, { data: pendingReqs }] = await Promise.all([
          supabase
            .from("invoices")
            .select("amount")
            .eq("sector_id", sector.id)
            .neq("status", "paid")
            .or("flow_stage.is.null,flow_stage.neq.cancelled"),
          supabase
            .from("requisitions")
            .select("amount")
            .eq("sector_id", sector.id)
            .eq("status", "open"),
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
      .select("*, sectors(name)")
      .order("date", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    res.json(
      (data ?? []).map((r: any) => ({
        ...r,
        sector_name: r.sectors?.name ?? null,
        sectors: undefined,
      }))
    );
  });

  app.post("/api/requisitions", async (req, res) => {
    const { sector_id, description, amount, date } = req.body;
    if (!sector_id || !amount || !date)
      return res.status(400).json({ error: "sector_id, amount e date são obrigatórios" });

    const { data, error } = await supabase
      .from("requisitions")
      .insert({ sector_id, description: description || null, amount, date, status: "open" })
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
  app.get("/api/invoices", async (_req, res) => {
    const { data, error } = await supabase
      .from("invoices")
      .select("*, sectors(name), users(name)")
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
      const buffer = fs.readFileSync(req.file.path);
      const parsed = await pdfParse(buffer);
      const text = parsed.text || "";

      const pick = (...patterns: RegExp[]) => {
        for (const p of patterns) {
          const m = text.match(p);
          if (m?.[1]) return m[1].trim();
        }
        return "";
      };

      const provider_name = pick(
        /(?:Raz[aã]o\s*Social|Fornecedor)\s*[:\-]\s*([^\n\r]+)/i,
        /Emitente\s*[:\-]\s*([^\n\r]+)/i
      );
      const invoice_number = pick(
        /(?:N[úu]mero\s*da\s*NF-e|N[úu]mero\s*da\s*Nota|NF[-\s]?e?)\s*[:#\-]?\s*([A-Z0-9.\-\/]+)/i
      );
      const issue_dateRaw = pick(
        /(?:Data\s*de\s*Emiss[aã]o|Emiss[aã]o)\s*[:\-]?\s*(\d{2}[\/.-]\d{2}[\/.-]\d{2,4})/i
      );
      const due_dateRaw = pick(
        /(?:Data\s*de\s*Vencimento|Vencimento)\s*[:\-]?\s*(\d{2}[\/.-]\d{2}[\/.-]\d{2,4})/i
      );
      const amountRaw = pick(
        /(?:Valor\s*Total|Valor\s*da\s*Nota|Total)\s*[:\-]?\s*R?\$?\s*([\d.,]+)/i
      );

      // Faz upload para Supabase Storage
      const fileBuffer = fs.readFileSync(req.file.path);
      const storagePath = `invoices/${Date.now()}-${req.file.originalname || "nota.pdf"}`;
      await supabase.storage.from("invoice-files").upload(storagePath, fileBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });
      const { data: urlData } = supabase.storage.from("invoice-files").getPublicUrl(storagePath);
      fs.unlinkSync(req.file.path);

      res.json({
        success: true,
        extracted: {
          invoice_number,
          provider_name,
          issue_date: toIsoDate(issue_dateRaw),
          due_date: toIsoDate(due_dateRaw),
          amount: toAmount(amountRaw),
        },
        file_path: urlData.publicUrl,
      });
    } catch {
      res.json({
        success: false,
        warning: "PDF enviado, mas não foi possível extrair campos automaticamente. Preencha manualmente.",
        extracted: { invoice_number: "", provider_name: "", issue_date: "", due_date: "", amount: "" },
        file_path: req.file?.path?.replace(/\\/g, "/") ?? "",
      });
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
    const { code, name, sector_id, active } = req.body;
    if (!code || !name || !sector_id)
      return res.status(400).json({ error: "code, name e sector_id são obrigatórios" });
    const { data, error } = await supabase
      .from("crds")
      .insert({ code, name, sector_id: Number(sector_id), active: active !== false })
      .select("id")
      .single();
    if (error)
      return res.status(400).json({ error: "Não foi possível cadastrar CRD (código já existe neste setor?)" });
    res.json({ id: data.id });
  });

  app.patch("/api/crds/:id", async (req, res) => {
    const { id } = req.params;
    const { code, name, sector_id, active } = req.body;
    if (!code || !name || !sector_id)
      return res.status(400).json({ error: "code, name e sector_id são obrigatórios" });

    const { error } = await supabase
      .from("crds")
      .update({
        code: String(code).trim(),
        name: String(name).trim(),
        sector_id: Number(sector_id),
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
          code: row.code,
          name: row.name,
          sector_id: sectorIdByGroup.get(row.groupName.toUpperCase()),
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
  // SCENARIOS
  // ====================================================
  app.get("/api/scenarios", async (_req, res) => {
    const { data, error } = await supabase.from("scenarios").select("*");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  return app;
}
