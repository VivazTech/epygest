import express from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import * as pdfParseModule from "pdf-parse";
import fs from "node:fs";
import path from "node:path";
import db from "./src/db.ts";

const pdfParse = (pdfParseModule as any).default ?? (pdfParseModule as any);

async function startServer() {
  const app = express();
  const PORT = 3000;
  const uploadDir = path.resolve("uploads");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const upload = multer({ dest: uploadDir });

  app.use(express.json());
  app.use("/uploads", express.static(uploadDir));

  // --- API Routes ---

  // Auth (Simple mock)
  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND password = ?').get(email, password) as any;
    if (user) {
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } else {
      res.status(401).json({ error: "Credenciais inválidas" });
    }
  });

  // Dashboard Indicators
  app.get("/api/dashboard/indicators", (req, res) => {
    const { month, year } = req.query;
    
    // In a real app, we'd filter by month/year. For mock, we'll return aggregated data.
    const revenue = db.prepare("SELECT SUM(amount) as total FROM financial_records WHERE type = 'revenue'").get() as any;
    const expenses = db.prepare("SELECT SUM(amount) as total FROM financial_records WHERE type = 'expense'").get() as any;
    
    const monthlyRevenue = db.prepare("SELECT SUM(amount) as total FROM financial_records WHERE type = 'revenue' AND strftime('%m', date) = ?").get('03') as any;

    res.json({
      receitaMensal: monthlyRevenue.total || 0,
      receitaAcumulada: revenue.total || 0,
      faturamentoMensal: (monthlyRevenue.total || 0) * 1.1, // Mock faturamento
      faturamentoAcumulado: (revenue.total || 0) * 1.1,
      saldo: (revenue.total || 0) - (expenses.total || 0),
      lucro: ((revenue.total || 0) - (expenses.total || 0)) * 0.8,
      crescimento: 12.5,
      cac: 450.00,
      ticketMedio: 1250.00,
      investimentos: 15,
      estoque: 450000,
      ncg: 120000,
      caixaMinimo: 80000,
      pontoEquilibrio: 180000
    });
  });

  // Financial Records / DRE Data
  app.get("/api/financial/records", (req, res) => {
    const records = db.prepare(`
      SELECT fr.*, c.name as category_name, s.name as sector_name 
      FROM financial_records fr
      LEFT JOIN categories c ON fr.category_id = c.id
      LEFT JOIN sectors s ON fr.sector_id = s.id
      ORDER BY date DESC
    `).all();
    res.json(records);
  });

  // Sectors & Budgets
  app.get("/api/sectors", (req, res) => {
    const sectors = db.prepare(`
      SELECT s.*, 
      (
        SELECT SUM(amount)
        FROM invoices
        WHERE sector_id = s.id
          AND status != 'paid'
          AND (flow_stage IS NULL OR flow_stage != 'cancelled')
      ) as pending_invoices,
      (
        SELECT SUM(amount)
        FROM requisitions r
        WHERE r.sector_id = s.id
          AND r.status = 'open'
      ) as pending_requisitions,
      (
        COALESCE((
          SELECT SUM(amount)
          FROM invoices
          WHERE sector_id = s.id
            AND status != 'paid'
            AND (flow_stage IS NULL OR flow_stage != 'cancelled')
        ), 0)
        +
        COALESCE((
          SELECT SUM(amount)
          FROM requisitions r
          WHERE r.sector_id = s.id
            AND r.status = 'open'
        ), 0)
      ) as pending_amount
      FROM sectors s
    `).all();
    res.json(sectors);
  });

  // Requisições internas (almoxarifado)
  app.get("/api/requisitions", (req, res) => {
    const rows = db.prepare(`
      SELECT r.*, s.name as sector_name
      FROM requisitions r
      LEFT JOIN sectors s ON r.sector_id = s.id
      ORDER BY date DESC, id DESC
    `).all();
    res.json(rows);
  });

  app.post("/api/requisitions", (req, res) => {
    const { sector_id, description, amount, date } = req.body as any;
    if (!sector_id || !amount || !date) {
      return res.status(400).json({ error: "sector_id, amount e date são obrigatórios" });
    }
    const result = db.prepare(`
      INSERT INTO requisitions (sector_id, description, amount, date, status)
      VALUES (?, ?, ?, ?, 'open')
    `).run(sector_id, description || null, amount, date);
    res.json({ id: result.lastInsertRowid });
  });

  app.patch("/api/requisitions/:id/status", (req, res) => {
    const { id } = req.params;
    const { status } = req.body as any;
    if (!['open', 'cancelled', 'posted'].includes(status)) {
      return res.status(400).json({ error: "Status inválido" });
    }
    db.prepare(`UPDATE requisitions SET status = ? WHERE id = ?`).run(status, id);
    res.json({ success: true });
  });

  // Invoices
  app.get("/api/invoices", (req, res) => {
    const invoices = db.prepare(`
      SELECT i.*, s.name as sector_name, u.name as user_name
      FROM invoices i
      LEFT JOIN sectors s ON i.sector_id = s.id
      LEFT JOIN users u ON i.user_id = u.id
      ORDER BY i.due_date ASC
    `).all();
    res.json(invoices);
  });

  app.get("/api/invoices/report", (req, res) => {
    const { from, to, payment_method } = req.query as any as {
      from?: string;
      to?: string;
      payment_method?: string;
    };

    const where: string[] = [];
    const params: any[] = [];

    if (from) {
      where.push("i.due_date >= ?");
      params.push(from);
    }
    if (to) {
      where.push("i.due_date <= ?");
      params.push(to);
    }
    if (payment_method) {
      where.push("i.payment_method = ?");
      params.push(payment_method);
    }

    // Relatório focado em notas "para pagamento" (não canceladas)
    where.push("(i.flow_stage IS NULL OR i.flow_stage != 'cancelled')");

    const sql = `
      SELECT
        i.id,
        i.invoice_number,
        i.provider_name,
        s.name as sector_name,
        i.amount,
        i.issue_date,
        i.due_date,
        i.payment_method,
        i.pix_key,
        i.flow_stage,
        i.status,
        i.file_path,
        i.boleto_file_path,
        i.natureza,
        i.payment_receipt_path,
        i.created_at
      FROM invoices i
      LEFT JOIN sectors s ON i.sector_id = s.id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY i.due_date ASC
    `;

    const rows = db.prepare(sql).all(...params) as any[];

    const escapeCsv = (value: any) => {
      const str = value === null || value === undefined ? "" : String(value);
      const escaped = str.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const header = [
      "id",
      "invoice_number",
      "provider_name",
      "sector_name",
      "amount",
      "issue_date",
      "due_date",
      "payment_method",
      "pix_key",
      "flow_stage",
      "status",
      "file_path",
      "boleto_file_path",
      "natureza",
      "payment_receipt_path",
      "created_at",
    ];

    const csvLines = [
      header.join(","),
      ...rows.map((r) =>
        header.map((k) => escapeCsv((r as any)[k])).join(",")
      ),
    ];

    const fileName = `relatorio-notas-${Date.now()}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send("\uFEFF" + csvLines.join("\n"));
  });

  app.post("/api/invoices/extract", upload.single("invoice_pdf"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "PDF não enviado" });
    const normalizedPath = req.file.path.replace(/\\/g, "/");
    try {
      const buffer = fs.readFileSync(req.file.path);
      const parsed = await pdfParse(buffer);
      const text = parsed.text || "";

      const clean = (value?: string | null) => value?.trim() || "";
      const pick = (...patterns: RegExp[]) => {
        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match?.[1]) return clean(match[1]);
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
        const parsedAmount = Number(normalized);
        if (Number.isNaN(parsedAmount)) return "";
        return parsedAmount.toFixed(2);
      };

      res.json({
        success: true,
        extracted: {
          invoice_number,
          provider_name,
          issue_date: toIsoDate(issue_dateRaw),
          due_date: toIsoDate(due_dateRaw),
          amount: toAmount(amountRaw),
        },
        file_path: normalizedPath,
      });
    } catch (error) {
      // Alguns PDFs (escaneados, protegidos, imagem pura) não têm texto extraível.
      // Nesses casos, mantemos o upload válido e retornamos campos vazios para preenchimento manual.
      res.json({
        success: false,
        warning: "PDF enviado, mas não foi possível extrair campos automaticamente. Preencha manualmente.",
        extracted: {
          invoice_number: "",
          provider_name: "",
          issue_date: "",
          due_date: "",
          amount: "",
        },
        file_path: normalizedPath,
      });
    }
  });

  app.post("/api/invoices/receipt", upload.single("receipt_file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Comprovante não enviado" });

    const allowedTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
    if (!allowedTypes.includes(req.file.mimetype)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Formato inválido. Envie PDF, PNG ou JPG." });
    }

    res.json({
      file_path: req.file.path.replace(/\\/g, "/"),
    });
  });

  app.post("/api/invoices/boleto", upload.single("boleto_file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Boleto não enviado" });
    if (req.file.mimetype !== "application/pdf") {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Formato inválido. Envie o boleto em PDF." });
    }
    res.json({
      file_path: req.file.path.replace(/\\/g, "/"),
    });
  });

  app.post("/api/invoices", (req, res) => {
    const { invoice_number, provider_name, amount, issue_date, due_date, sector_id, user_id, file_path, boleto_file_path, natureza, crd, payment_method, pix_key } = req.body;
    const result = db.prepare(`
      INSERT INTO invoices (invoice_number, provider_name, amount, issue_date, due_date, sector_id, user_id, file_path, boleto_file_path, natureza, crd, payment_method, pix_key, status, flow_stage)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', 'control_pending')
    `).run(
      invoice_number,
      provider_name,
      amount,
      issue_date,
      due_date,
      sector_id,
      user_id,
      file_path || null,
      boleto_file_path || null,
      natureza || 'O',
      crd || null,
      payment_method || null,
      pix_key || null
    );
    res.json({ id: result.lastInsertRowid });
  });

  app.patch("/api/invoices/:id/flow", (req, res) => {
    const { id } = req.params;
    const { action, actorSector, payment_receipt_path, cancel_reason } = req.body as {
      action?: "approve_control" | "mark_paid" | "cancel_request";
      actorSector?: string;
      payment_receipt_path?: string;
      cancel_reason?: string;
    };

    const invoice = db.prepare("SELECT * FROM invoices WHERE id = ?").get(id) as any;
    if (!invoice) return res.status(404).json({ error: "Nota não encontrada" });

    if (action === "approve_control") {
      if ((invoice.flow_stage || "control_pending") !== "control_pending") {
        return res.status(400).json({ error: "A nota não está aguardando aprovação do Controle" });
      }
      db.prepare(`
        UPDATE invoices
        SET flow_stage = 'control_approved',
            approved_at = CURRENT_TIMESTAMP,
            approved_by_sector = ?
        WHERE id = ?
      `).run(actorSector || "CONTROLE", id);
      return res.json({ success: true });
    }

    if (action === "mark_paid") {
      if ((invoice.flow_stage || "control_pending") !== "control_approved") {
        return res.status(400).json({ error: "A nota precisa ser aprovada pelo Controle antes do pagamento" });
      }
      db.prepare(`
        UPDATE invoices
        SET status = 'paid',
            flow_stage = 'paid',
            paid_at = CURRENT_TIMESTAMP,
            paid_by_sector = ?,
            payment_receipt_path = ?
        WHERE id = ?
      `).run(actorSector || "FINANCEIRO", payment_receipt_path || null, id);
      return res.json({ success: true });
    }

    if (action === "cancel_request") {
      if (invoice.status === "paid" || (invoice.flow_stage || "control_pending") === "paid") {
        return res.status(400).json({ error: "Não é possível cancelar uma nota já paga" });
      }
      if ((invoice.flow_stage || "control_pending") === "cancelled") {
        return res.status(400).json({ error: "Esta nota já está cancelada" });
      }
      db.prepare(`
        UPDATE invoices
        SET flow_stage = 'cancelled',
            cancelled_at = CURRENT_TIMESTAMP,
            cancelled_by_sector = ?,
            cancel_reason = ?
        WHERE id = ?
      `).run(actorSector || "SOLICITANTE", cancel_reason || null, id);
      return res.json({ success: true });
    }

    res.status(400).json({ error: "Ação inválida" });
  });

  // Categories
  app.get("/api/categories", (req, res) => {
    const categories = db.prepare('SELECT * FROM categories').all();
    res.json(categories);
  });

  // Cadastros: Formas de pagamento
  app.get("/api/payment-methods", (req, res) => {
    const rows = db.prepare("SELECT * FROM payment_methods ORDER BY active DESC, name ASC").all();
    res.json(rows);
  });

  app.post("/api/payment-methods", (req, res) => {
    const { key, name, active } = req.body as any;
    if (!key || !name) return res.status(400).json({ error: "key e name são obrigatórios" });
    try {
      const result = db.prepare("INSERT INTO payment_methods (key, name, active) VALUES (?, ?, ?)").run(
        key,
        name,
        active === false ? 0 : 1
      );
      res.json({ id: result.lastInsertRowid });
    } catch (e: any) {
      res.status(400).json({ error: "Não foi possível cadastrar (key duplicada?)" });
    }
  });

  // Cadastros: CRD
  app.get("/api/crds", (req, res) => {
    const { sector_id } = req.query as { sector_id?: string };
    const hasSectorFilter = !!sector_id && Number.isFinite(Number(sector_id));
    const rows = hasSectorFilter
      ? db.prepare(`
          SELECT c.*, s.name as sector_name
          FROM crds c
          LEFT JOIN sectors s ON s.id = c.sector_id
          WHERE c.sector_id = ?
          ORDER BY c.active DESC, c.code ASC
        `).all(Number(sector_id))
      : db.prepare(`
          SELECT c.*, s.name as sector_name
          FROM crds c
          LEFT JOIN sectors s ON s.id = c.sector_id
          ORDER BY s.name ASC, c.active DESC, c.code ASC
        `).all();
    res.json(rows);
  });

  app.post("/api/crds", (req, res) => {
    const { code, name, sector_id, active } = req.body as any;
    if (!code || !name || !sector_id) return res.status(400).json({ error: "code, name e sector_id são obrigatórios" });
    try {
      const result = db.prepare("INSERT INTO crds (code, name, sector_id, active) VALUES (?, ?, ?, ?)").run(
        code,
        name,
        Number(sector_id),
        active === false ? 0 : 1
      );
      res.json({ id: result.lastInsertRowid });
    } catch (e: any) {
      res.status(400).json({ error: "Não foi possível cadastrar CRD (código já existe neste setor?)" });
    }
  });

  // Scenarios
  app.get("/api/scenarios", (req, res) => {
    const scenarios = db.prepare('SELECT * FROM scenarios').all();
    res.json(scenarios);
  });

  // --- Vite Setup ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
