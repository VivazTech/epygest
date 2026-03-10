import Database from 'better-sqlite3';
import path from 'path';

const db = new Database('finance.db');

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin', 'finance', 'manager', 'viewer')) NOT NULL,
    sector_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    budget_limit REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT CHECK(type IN ('revenue', 'expense')) NOT NULL,
    parent_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS financial_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    description TEXT,
    amount REAL NOT NULL,
    type TEXT CHECK(type IN ('revenue', 'expense')) NOT NULL,
    category_id INTEGER,
    sector_id INTEGER,
    status TEXT CHECK(status IN ('pending', 'paid', 'overdue')) DEFAULT 'pending',
    is_forecast BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (sector_id) REFERENCES sectors(id)
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT NOT NULL,
    provider_name TEXT NOT NULL,
    amount REAL NOT NULL,
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    status TEXT CHECK(status IN ('received', 'paid', 'overdue')) DEFAULT 'received',
    sector_id INTEGER,
    user_id INTEGER,
    file_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sector_id) REFERENCES sectors(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS scenarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, -- 'Otimista', 'Regular', 'Pessimista'
    year INTEGER NOT NULL,
    target_revenue REAL,
    target_profit REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed Initial Data
const seed = () => {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCount.count > 0) return;

  // Sectors
  const insertSector = db.prepare('INSERT INTO sectors (name, budget_limit) VALUES (?, ?)');
  const marketingId = insertSector.run('Marketing', 50000).lastInsertRowid;
  const itId = insertSector.run('TI', 80000).lastInsertRowid;
  const hrId = insertSector.run('RH', 30000).lastInsertRowid;
  const salesId = insertSector.run('Vendas', 100000).lastInsertRowid;

  // Users
  const insertUser = db.prepare('INSERT INTO users (name, email, password, role, sector_id) VALUES (?, ?, ?, ?, ?)');
  insertUser.run('Admin FinanCorp', 'admin@financorp.com', 'admin123', 'admin', null);
  insertUser.run('Financeiro João', 'finance@financorp.com', 'finance123', 'finance', null);
  insertUser.run('Gestor Maria', 'maria@marketing.com', 'maria123', 'manager', marketingId);

  // Categories
  const insertCat = db.prepare('INSERT INTO categories (name, type, parent_id) VALUES (?, ?, ?)');
  const revId = insertCat.run('Receitas Operacionais', 'revenue', null).lastInsertRowid;
  insertCat.run('Venda de Produtos', 'revenue', revId);
  insertCat.run('Prestação de Serviços', 'revenue', revId);

  const expId = insertCat.run('Despesas Operacionais', 'expense', null).lastInsertRowid;
  insertCat.run('Salários', 'expense', expId);
  insertCat.run('Marketing e Publicidade', 'expense', expId);
  insertCat.run('Infraestrutura', 'expense', expId);

  // Financial Records (Mock data for last 12 months)
  const insertRecord = db.prepare('INSERT INTO financial_records (date, amount, type, category_id, sector_id, status) VALUES (?, ?, ?, ?, ?, ?)');
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 15);
    const dateStr = d.toISOString().split('T')[0];
    
    // Revenue
    insertRecord.run(dateStr, 150000 + Math.random() * 50000, 'revenue', 2, salesId, 'paid');
    insertRecord.run(dateStr, 80000 + Math.random() * 20000, 'revenue', 3, salesId, 'paid');
    
    // Expenses
    insertRecord.run(dateStr, 40000, 'expense', 5, hrId, 'paid');
    insertRecord.run(dateStr, 15000 + Math.random() * 5000, 'expense', 6, marketingId, 'paid');
    insertRecord.run(dateStr, 10000 + Math.random() * 2000, 'expense', 7, itId, 'paid');
  }

  // Scenarios
  const insertScenario = db.prepare('INSERT INTO scenarios (name, year, target_revenue, target_profit) VALUES (?, ?, ?, ?)');
  insertScenario.run('Otimista', 2024, 3000000, 600000);
  insertScenario.run('Regular', 2024, 2500000, 400000);
  insertScenario.run('Pessimista', 2024, 2000000, 200000);
};

seed();

export default db;
