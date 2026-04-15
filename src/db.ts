import Database from 'better-sqlite3';

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
    status TEXT CHECK(status IN ('received', 'control_pending', 'control_approved', 'paid', 'overdue')) DEFAULT 'control_pending',
    flow_stage TEXT CHECK(flow_stage IN ('control_pending', 'control_approved', 'paid', 'cancelled')) DEFAULT 'control_pending',
    sector_id INTEGER,
    user_id INTEGER,
    file_path TEXT,
    boleto_file_path TEXT,
    natureza TEXT CHECK(natureza IN ('M', 'O')) DEFAULT 'O',
    crd TEXT,
    payment_method TEXT CHECK(payment_method IN ('pix', 'boleto', 'cartao_credito', 'dinheiro')),
    pix_key TEXT,
    approved_at DATETIME,
    approved_by_sector TEXT,
    paid_at DATETIME,
    paid_by_sector TEXT,
    payment_receipt_path TEXT,
    cancelled_at DATETIME,
    cancelled_by_sector TEXT,
    cancel_reason TEXT,
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

  CREATE TABLE IF NOT EXISTS payment_methods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS crds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    sector_id INTEGER,
    active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sector_id) REFERENCES sectors(id),
    UNIQUE(code, sector_id)
  );

  CREATE TABLE IF NOT EXISTS requisitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sector_id INTEGER NOT NULL,
    description TEXT,
    amount REAL NOT NULL,
    date DATE NOT NULL,
    status TEXT CHECK(status IN ('open', 'cancelled', 'posted')) DEFAULT 'open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sector_id) REFERENCES sectors(id)
  );
`);

// Forward-only migration for existing databases
const tableInfo = db.prepare(`PRAGMA table_info(invoices)`).all() as Array<{ name: string }>;
const hasColumn = (name: string) => tableInfo.some((column) => column.name === name);

if (!hasColumn('approved_at')) db.exec(`ALTER TABLE invoices ADD COLUMN approved_at DATETIME`);
if (!hasColumn('approved_by_sector')) db.exec(`ALTER TABLE invoices ADD COLUMN approved_by_sector TEXT`);
if (!hasColumn('paid_at')) db.exec(`ALTER TABLE invoices ADD COLUMN paid_at DATETIME`);
if (!hasColumn('paid_by_sector')) db.exec(`ALTER TABLE invoices ADD COLUMN paid_by_sector TEXT`);
if (!hasColumn('payment_receipt_path')) db.exec(`ALTER TABLE invoices ADD COLUMN payment_receipt_path TEXT`);
if (!hasColumn('flow_stage')) db.exec(`ALTER TABLE invoices ADD COLUMN flow_stage TEXT DEFAULT 'control_pending'`);
if (!hasColumn('boleto_file_path')) db.exec(`ALTER TABLE invoices ADD COLUMN boleto_file_path TEXT`);
if (!hasColumn('crd')) db.exec(`ALTER TABLE invoices ADD COLUMN crd TEXT`);
if (!hasColumn('payment_method')) db.exec(`ALTER TABLE invoices ADD COLUMN payment_method TEXT`);
if (!hasColumn('pix_key')) db.exec(`ALTER TABLE invoices ADD COLUMN pix_key TEXT`);
if (!hasColumn('cancelled_at')) db.exec(`ALTER TABLE invoices ADD COLUMN cancelled_at DATETIME`);
if (!hasColumn('cancelled_by_sector')) db.exec(`ALTER TABLE invoices ADD COLUMN cancelled_by_sector TEXT`);
if (!hasColumn('cancel_reason')) db.exec(`ALTER TABLE invoices ADD COLUMN cancel_reason TEXT`);
if (!hasColumn('natureza')) db.exec(`ALTER TABLE invoices ADD COLUMN natureza TEXT DEFAULT 'O'`);

const crdTableInfo = db.prepare(`PRAGMA table_info(crds)`).all() as Array<{ name: string }>;
const crdHasColumn = (name: string) => crdTableInfo.some((column) => column.name === name);
if (!crdHasColumn('sector_id')) db.exec(`ALTER TABLE crds ADD COLUMN sector_id INTEGER`);

// Seeds de cadastros (se vazio)
const paymentMethodCount = db.prepare('SELECT COUNT(*) as count FROM payment_methods').get() as { count: number };
if (paymentMethodCount.count === 0) {
  const insertPaymentMethod = db.prepare('INSERT INTO payment_methods (key, name, active) VALUES (?, ?, ?)');
  insertPaymentMethod.run('pix', 'Pix', 1);
  insertPaymentMethod.run('boleto', 'Boleto', 1);
  insertPaymentMethod.run('cartao_credito', 'Cartão de crédito', 1);
  insertPaymentMethod.run('dinheiro', 'Efetivo', 1);
}

const crdCount = db.prepare('SELECT COUNT(*) as count FROM crds').get() as { count: number };
if (crdCount.count === 0) {
  const rhSector = db.prepare(`SELECT id FROM sectors WHERE UPPER(name) = 'RH' LIMIT 1`).get() as { id?: number } | undefined;
  const rhSectorId = rhSector?.id ?? null;
  const insertCrd = db.prepare('INSERT INTO crds (code, name, sector_id, active) VALUES (?, ?, ?, ?)');
  insertCrd.run('350', 'SEGURO VIDA EM GRUPO', rhSectorId, 1);
  insertCrd.run('379', 'SINDICATO HOTEIS E BARES', rhSectorId, 1);
  insertCrd.run('398', 'DESPESAS MENSAIS RH', rhSectorId, 1);
  insertCrd.run('536', 'COSTURAS ZZ', rhSectorId, 1);
  insertCrd.run('423', 'CURSOS/TREINAMENTOS/CAPACITACOES', rhSectorId, 1);
  insertCrd.run('439', 'XEROX/PLASTIFICACOES', rhSectorId, 1);
  insertCrd.run('603', 'ENDOMARKETING', rhSectorId, 1);
  insertCrd.run('664', 'COSTURAS UNIFORMES RH ZZ', rhSectorId, 1);
  insertCrd.run('337', 'TAXA PROC TRABALHISTA', rhSectorId, 1);
  insertCrd.run('RH-RECURSOS-HUMANOS', 'RECURSOS HUMANOS', rhSectorId, 1);
  insertCrd.run('RH-UNIFORMES-EPIS', 'UNIFORMES E EPIS', rhSectorId, 1);
  insertCrd.run('RH-FOLHA-PAGAMENTO', 'Folha de pagamento', rhSectorId, 1);
  insertCrd.run('RH-EXTRAS', 'Extras', rhSectorId, 1);
  insertCrd.run('RH-COMBUSTIVEL-FOLHA', 'COMBUSTIVEL FOLHA', rhSectorId, 1);
  insertCrd.run('267', 'VALE TRANSPORTE', rhSectorId, 1);
  insertCrd.run('296', 'PROCESSO TRABALHISTA', rhSectorId, 1);
  insertCrd.run('297', 'CONVENIOS MEDICOS', rhSectorId, 1);
  insertCrd.run('299', 'CONVENIO ODONTOLOGICO', rhSectorId, 1);
  insertCrd.run('300', 'AJUDA DE CUSTO', rhSectorId, 1);
  insertCrd.run('306', 'RPA', rhSectorId, 1);
  insertCrd.run('308', 'VALE ALIMENTACAO/REFEICAO HOTEL', rhSectorId, 1);
  insertCrd.run('630', 'ASSIDUIDADE E BOAS PRATICAS', rhSectorId, 1);
  insertCrd.run('378', 'SINDICATO PATRONAL', rhSectorId, 1);
  insertCrd.run('382', 'SERV SEGURANCA TRABALHO', rhSectorId, 1);
  insertCrd.run('528', 'COMPLEMENTO FOLHA ZZ', rhSectorId, 1);
  insertCrd.run('302', 'AUTO INFRACAO MINISTERIO TRABALHO', rhSectorId, 1);
}

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
  insertUser.run('Admin EpyGest', 'admin@epygest.com', 'admin123', 'admin', null);
  insertUser.run('Financeiro João', 'finance@epygest.com', 'finance123', 'finance', null);
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
