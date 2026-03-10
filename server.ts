import express from "express";
import { createServer as createViteServer } from "vite";
import db from "./src/db.ts";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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
      (SELECT SUM(amount) FROM invoices WHERE sector_id = s.id AND status != 'paid') as pending_amount
      FROM sectors s
    `).all();
    res.json(sectors);
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

  app.post("/api/invoices", (req, res) => {
    const { invoice_number, provider_name, amount, issue_date, due_date, sector_id, user_id } = req.body;
    const result = db.prepare(`
      INSERT INTO invoices (invoice_number, provider_name, amount, issue_date, due_date, sector_id, user_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'received')
    `).run(invoice_number, provider_name, amount, issue_date, due_date, sector_id, user_id);
    res.json({ id: result.lastInsertRowid });
  });

  app.patch("/api/invoices/:id/status", (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(status, id);
    res.json({ success: true });
  });

  // Categories
  app.get("/api/categories", (req, res) => {
    const categories = db.prepare('SELECT * FROM categories').all();
    res.json(categories);
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
