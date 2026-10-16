/**
 * Aplica sql/73_invoices_description.sql via conexão Postgres (DATABASE_URL / SUPABASE_DB_URL)
 * ou tenta o pooler com SUPABASE_DB_PASSWORD.
 */
import "dotenv/config";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

function buildConnectionString() {
  const direct =
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_URL ||
    process.env.DB_URL;
  if (direct) return direct;

  const password =
    process.env.SUPABASE_DB_PASSWORD ||
    process.env.POSTGRES_PASSWORD ||
    process.env.DB_PASSWORD;
  const url = process.env.SUPABASE_URL || "";
  const ref = url.match(/https:\/\/([^.]+)/)?.[1];
  if (!password || !ref) return null;

  const encoded = encodeURIComponent(password);
  return `postgresql://postgres.${ref}:${encoded}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`;
}

async function main() {
  const connectionString = buildConnectionString();
  if (!connectionString) {
    console.error(
      "Sem conexão Postgres. Defina DATABASE_URL (ou SUPABASE_DB_PASSWORD) e rode de novo," +
        " ou execute sql/73_invoices_description.sql no SQL Editor do Supabase."
    );
    process.exit(1);
  }

  let Client;
  try {
    ({ Client } = require("pg"));
  } catch {
    console.error('Pacote "pg" não instalado. Rode: npm i -D pg');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query(
      "ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS description TEXT;"
    );
    const check = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'description'`
    );
    if (!check.rowCount) {
      console.error("Coluna description não encontrada após ALTER.");
      process.exit(1);
    }
    console.log("OK: invoices.description disponível.");
  } catch (err) {
    console.error("Falha ao aplicar migration:", err?.message || err);
    process.exit(1);
  } finally {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }
}

main();
