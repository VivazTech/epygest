import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import xlsx from "xlsx";
import PDFDocument from "pdfkit";
import { supabase } from "./lib/supabase.js";
import {
  SESSION_COOKIE,
  hashPassword,
  verifyPassword,
  isBcryptHash,
  validatePasswordStrength,
  signSession,
  sessionCookieOptions,
  requireAuth,
  requireRole,
} from "./lib/auth.js";
import { logImportHistory } from "./lib/importHistory.js";
import {
  classificarLancamentosImportacao,
  calcularApuracaoMensal,
  calcularTotalProventos,
  inferirParametroRubrica,
  lancamentosDaImportacao,
  listarRubricasNovasParaCadastro,
  type RubricaParametro,
  type EncargosParametro,
  type FolhaConfig,
} from "./lib/folhaApuracao.js";

import { parseInvoicePdfText } from "./lib/parseInvoicePdf.js";
import { isSharedCrdCode } from "./lib/sharedCrds.js";
import {
  STORAGE_BUCKET,
  STORAGE_PREFIXES,
  normalizeStorageObjectPath,
  type StorageDocumentField,
} from "./lib/storagePath.js";

// Importa direto o parser para evitar o modo debug do index.js (que tenta abrir ./test/data/*)
const loadPdfParse = async () => {
  const mod = await import("pdf-parse/lib/pdf-parse.js");
  return (mod as any).default ?? (mod as any);
};

// pdfjs (vendorizado dentro do pdf-parse) dá acesso à posição (x,y) de cada
// trecho de texto do PDF — usado para reconstruir colunas de tabelas com
// precisão, em vez de tentar adivinhar limites em texto corrido sem separador.
const loadPdfJs = async () => {
  const mod = await import("pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js");
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

type DesbravadorParsedLine = {
  descricao: string;
  valor: number;
};

type ParsedImportSummary = {
  lines_count: number;
  total: number;
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

const fetchMonthlyValuesByYear = async (year: number) => {
  const pageSize = 1000;
  let from = 0;
  const rows: CrdMonthlyValueRow[] = [];

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("crd_monthly_values")
      .select("crd_id, year, month, value")
      .eq("year", year)
      .order("crd_id", { ascending: true })
      .range(from, to);

    if (error) {
      return { rows: [] as CrdMonthlyValueRow[], error };
    }

    const page = (data ?? []) as CrdMonthlyValueRow[];
    rows.push(...page);

    if (page.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null as any };
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

const sanitizeMonthBudget = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseDesbravadorPdfLines = (rawText: string) => {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const parsedLines: DesbravadorParsedLine[] = [];
  const amountRegex = /^(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})$/;

  for (const line of lines) {
    const match = line.match(amountRegex);
    if (!match) continue;
    const descricao = String(match[1] || "").trim();
    const valor = Number(toAmount(match[2] || ""));
    if (!descricao || !Number.isFinite(valor)) continue;
    parsedLines.push({ descricao, valor });
  }

  const uniqueByDescricao = new Map<string, number>();
  for (const item of parsedLines) {
    const current = uniqueByDescricao.get(item.descricao) || 0;
    uniqueByDescricao.set(item.descricao, current + item.valor);
  }

  const consolidated = Array.from(uniqueByDescricao.entries()).map(([descricao, valor]) => ({
    descricao,
    valor,
  }));

  return consolidated.sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
};

const normalizeExcelHeader = (value: any) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const parseExcelAmount = (value: any) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "").trim();
  if (!text) return NaN;
  const normalized = text.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const parseDesbravadorExcelLines = (rows: any[][]) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length) return [] as DesbravadorParsedLine[];

  let headerIdx = -1;
  let descriptionCol = -1;
  let amountCol = -1;

  for (let i = 0; i < Math.min(safeRows.length, 20); i += 1) {
    const row = safeRows[i] || [];
    const normalizedHeaders = row.map((cell) => normalizeExcelHeader(cell));
    const foundDescription = normalizedHeaders.findIndex((cell) =>
      /descricao|historico|conta|categoria|item|nome/.test(cell)
    );
    const foundAmount = normalizedHeaders.findIndex((cell) =>
      /valor|realizado|total|montante|saldo|vr/.test(cell)
    );
    if (foundDescription >= 0 && foundAmount >= 0) {
      headerIdx = i;
      descriptionCol = foundDescription;
      amountCol = foundAmount;
      break;
    }
  }

  const startDataIdx = headerIdx >= 0 ? headerIdx + 1 : 0;
  const parsedLines: DesbravadorParsedLine[] = [];

  for (let i = startDataIdx; i < safeRows.length; i += 1) {
    const row = safeRows[i] || [];
    const descricaoRaw =
      descriptionCol >= 0
        ? row[descriptionCol]
        : row.find((cell) => String(cell || "").trim().length > 0);
    const valorRaw =
      amountCol >= 0
        ? row[amountCol]
        : [...row].reverse().find((cell) => String(cell || "").trim().length > 0);

    const descricao = String(descricaoRaw || "").trim();
    const valor = parseExcelAmount(valorRaw);

    if (!descricao || !Number.isFinite(valor)) continue;
    parsedLines.push({ descricao, valor });
  }

  const uniqueByDescricao = new Map<string, number>();
  for (const line of parsedLines) {
    uniqueByDescricao.set(line.descricao, (uniqueByDescricao.get(line.descricao) || 0) + line.valor);
  }

  return Array.from(uniqueByDescricao.entries())
    .map(([descricao, valor]) => ({ descricao, valor }))
    .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
};

const parseDesbravadorExcelLinesWithColumns = (
  rows: any[][],
  descriptionColumnIndex: number,
  valueColumnIndex: number
) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const parsedLines: DesbravadorParsedLine[] = [];

  for (const row of safeRows) {
    const descricao = String(row?.[descriptionColumnIndex] ?? "").trim();
    const valor = parseExcelAmount(row?.[valueColumnIndex]);
    if (!descricao || !Number.isFinite(valor)) continue;
    parsedLines.push({ descricao, valor });
  }

  const uniqueByDescricao = new Map<string, number>();
  for (const line of parsedLines) {
    uniqueByDescricao.set(line.descricao, (uniqueByDescricao.get(line.descricao) || 0) + line.valor);
  }

  return Array.from(uniqueByDescricao.entries())
    .map(([descricao, valor]) => ({ descricao, valor }))
    .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
};

const buildImportPreviewPayload = (
  lines: DesbravadorParsedLine[],
  fileName: string,
  month?: string,
  year?: string
) => {
  const summary: ParsedImportSummary = {
    lines_count: lines.length,
    total: lines.reduce((sum, line) => sum + line.valor, 0),
  };

  return {
    success: true,
    report_name: fileName || "relatorio-desbravador",
    period: {
      month: Number(month) || null,
      year: Number(year) || null,
    },
    summary,
    lines,
  };
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

const applyProvisionDateRange = (query: any, dateFrom: string, dateTo: string) =>
  query
    .gte("created_at", `${dateFrom}T00:00:00`)
    .lte("created_at", `${dateTo}T23:59:59.999`);

// Diretório de upload: /tmp no Vercel (serverless), local no dev
const uploadDir = process.env.VERCEL
  ? "/tmp/uploads"
  : path.resolve("uploads");

export function createApp() {
  const app = express();

  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  // Limite de tamanho para evitar DoS/esgotamento de disco. Excel/PDF grandes cabem em 20MB.
  const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
  const upload = multer({ dest: uploadDir, limits: { fileSize: MAX_UPLOAD_BYTES } });

  // ---------- Storage de documentos (bucket privado + signed URLs) ----------
  // O bucket "invoice-files" deve estar configurado como PRIVADO no Supabase.
  const SIGNED_URL_TTL = 60 * 60; // 1 hora

  const createSignedDocumentUrl = async (rawPath: string) => {
    const objectPath = normalizeStorageObjectPath(rawPath);
    if (!objectPath) return { error: "Caminho inválido" as const };
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(objectPath, SIGNED_URL_TTL);
    if (error || !data?.signedUrl) {
      console.error("Erro ao gerar signed URL:", error, { objectPath, rawPath });
      return { error: "Arquivo não encontrado" as const };
    }
    return { url: data.signedUrl };
  };

  // Faz upload com nome aleatório (sem usar o nome enviado pelo cliente) e retorna o object path.
  const uploadDocument = async (
    buffer: Buffer,
    prefix: (typeof STORAGE_PREFIXES)[number],
    ext: string,
    contentType: string
  ): Promise<string> => {
    const safeExt = String(ext).toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const objectPath = `${prefix}/${crypto.randomUUID()}.${safeExt}`;
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(objectPath, buffer, { contentType, upsert: false });
    if (error) throw error;
    return objectPath;
  };

  // Cabeçalhos de segurança (CSP desativado: o app serve HTML/JS inline via Vite/SPA).
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

  // CORS restrito a uma allowlist; permite envio de cookies de sessão.
  const corsOrigins = String(process.env.CORS_ORIGINS || process.env.APP_URL || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && corsOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.use(express.json());
  app.use(cookieParser());
  app.use("/uploads", express.static(uploadDir));

  // Helper para montar os setores do usuário (usado em login e /me).
  const buildUserSession = async (user: any) => {
    const { data: userSectorLinks } = await supabase
      .from("user_sectors")
      .select("sector_id")
      .eq("user_id", user.id);

    const sectorIds = Array.from(
      new Set(
        (userSectorLinks ?? [])
          .map((link: any) => Number(link.sector_id))
          .filter((id) => Number.isFinite(id))
      )
    );

    const fallbackSectorIds = sectorIds.length
      ? sectorIds
      : (Number.isFinite(Number(user.sector_id)) ? [Number(user.sector_id)] : []);

    const { data: sectorRows } = fallbackSectorIds.length
      ? await supabase.from("sectors").select("id, name").in("id", fallbackSectorIds)
      : { data: [] as any[] };

    const sectorNames = (sectorRows ?? []).map((row: any) => String(row.name || ""));
    const { password: _pwd, ...userWithoutPassword } = user;
    return { ...userWithoutPassword, sector_ids: fallbackSectorIds, sector_names: sectorNames };
  };

  // ====================================================
  // AUTH (rotas públicas)
  // ====================================================
  // Rate limiting contra brute-force/credential stuffing.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Muitas tentativas de login. Tente novamente em alguns minutos." },
  });

  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "");
      if (!email || !password) {
        return res.status(400).json({ error: "Informe e-mail e senha." });
      }

      const { data: user, error } = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .single();

      // Mensagem genérica: não revela se o e-mail existe.
      if (error || !user) {
        return res.status(401).json({ error: "Credenciais inválidas" });
      }

      const ok = await verifyPassword(password, String(user.password || ""));
      if (!ok) {
        return res.status(401).json({ error: "Credenciais inválidas" });
      }

      // Gera o token ANTES de qualquer escrita: se JWT_SECRET estiver ausente,
      // falha de forma clara (500) em vez de deixar a requisição travada.
      const token = signSession({ id: user.id, email: user.email, role: user.role, name: user.name });

      // Migração lazy: se a senha estava em texto puro, re-grava como hash bcrypt.
      if (!isBcryptHash(String(user.password || ""))) {
        try {
          const hashed = await hashPassword(password);
          await supabase.from("users").update({ password: hashed }).eq("id", user.id);
        } catch (err) {
          console.error("Falha ao migrar senha para hash:", err);
        }
      }

      const sessionData = await buildUserSession(user);
      res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
      res.json(sessionData);
    } catch (err) {
      console.error("Erro no login:", err);
      res.status(500).json({
        error: "Erro interno na autenticação. Verifique se JWT_SECRET está configurado no servidor.",
      });
    }
  });

  app.post("/api/auth/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(), maxAge: undefined });
    res.json({ success: true });
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", req.user!.id)
      .single();
    if (error || !user) return res.status(401).json({ error: "Sessão inválida" });
    res.json(await buildUserSession(user));
  });

  // ====================================================
  // A partir daqui, TODAS as rotas exigem autenticação.
  // ====================================================
  app.use("/api", requireAuth);

  // ====================================================
  // PLANILHAS (Extracao_Planilhas)
  // ====================================================
  const planilhasDir = path.resolve(process.cwd(), "Extracao_Planilhas");
  const planilhaFilePattern = /^aba_\d{3}_[A-Za-z0-9_]+\.json$/;

  app.get("/api/planilhas", requireRole("admin", "finance", "controle"), (_req, res) => {
    try {
      const files = fs
        .readdirSync(planilhasDir)
        .filter((f) => planilhaFilePattern.test(f))
        .sort();
      res.json(files);
    } catch (err: any) {
      console.error("Erro ao listar planilhas:", err);
      res.status(500).json({ error: "Não foi possível listar as planilhas" });
    }
  });

  app.get("/api/planilhas/:arquivo", requireRole("admin", "finance", "controle"), (req, res) => {
    const { arquivo } = req.params;
    if (!planilhaFilePattern.test(arquivo)) {
      return res.status(400).json({ error: "Arquivo inválido" });
    }
    const filePath = path.join(planilhasDir, arquivo);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Planilha não encontrada" });
    }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    fs.createReadStream(filePath).pipe(res);
  });

  app.get("/api/users", requireRole("admin"), async (_req, res) => {
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, role, sector_id, created_at")
      .order("name");

    if (error) { console.error(error); return res.status(500).json({ error: "Erro interno ao processar a solicitação." }); }

    const userIds = (data ?? []).map((user: any) => user.id);
    let sectorLinksByUserId = new Map<string, Array<{ id: number; name: string }>>();
    let sectorNameById = new Map<number, string>();

    if (userIds.length) {
      const { data: linksData, error: linksError } = await supabase
        .from("user_sectors")
        .select("user_id, sector_id")
        .in("user_id", userIds);

      // Se user_sectors não existir/der erro, seguimos com fallback em users.sector_id
      if (!linksError) {
        const sectorIds = Array.from(
          new Set(
            (linksData ?? [])
              .map((link: any) => Number(link.sector_id))
              .filter((sectorId) => Number.isFinite(sectorId))
          )
        );

        // Inclui também os setores "primários" dos usuários para compor nomes sempre.
        for (const user of data ?? []) {
          const sid = Number((user as any).sector_id);
          if (Number.isFinite(sid) && !sectorIds.includes(sid)) sectorIds.push(sid);
        }

        const { data: linkedSectors } = sectorIds.length
          ? await supabase.from("sectors").select("id, name").in("id", sectorIds)
          : { data: [] as any[] };

        sectorNameById = new Map<number, string>(
          (linkedSectors ?? []).map((sector: any) => [Number(sector.id), String(sector.name || "")])
        );

        for (const link of linksData ?? []) {
          const userId = String((link as any).user_id ?? "");
          const sectorId = Number((link as any).sector_id);
          if (!userId || !Number.isFinite(sectorId)) continue;
          if (!sectorLinksByUserId.has(userId)) sectorLinksByUserId.set(userId, []);
          sectorLinksByUserId.get(userId)!.push({
            id: sectorId,
            name: sectorNameById.get(sectorId) || "",
          });
        }
      } else {
        const fallbackIds = Array.from(
          new Set(
            (data ?? [])
              .map((user: any) => Number(user.sector_id))
              .filter((sectorId: number) => Number.isFinite(sectorId))
          )
        );
        const { data: fallbackSectors } = fallbackIds.length
          ? await supabase.from("sectors").select("id, name").in("id", fallbackIds)
          : { data: [] as any[] };
        sectorNameById = new Map<number, string>(
          (fallbackSectors ?? []).map((sector: any) => [Number(sector.id), String(sector.name || "")])
        );
      }
    }

    res.json(
      (data ?? []).map((user: any) => ({
        ...user,
        sector_name: Number.isFinite(Number(user.sector_id))
          ? (sectorNameById.get(Number(user.sector_id)) ?? null)
          : null,
        sector_ids:
          (sectorLinksByUserId.get(String(user.id)) ?? []).map((s) => s.id).length > 0
            ? (sectorLinksByUserId.get(String(user.id)) ?? []).map((s) => s.id)
            : (user.sector_id ? [Number(user.sector_id)] : []),
        sector_names:
          (sectorLinksByUserId.get(String(user.id)) ?? []).map((s) => s.name).length > 0
            ? (sectorLinksByUserId.get(String(user.id)) ?? []).map((s) => s.name)
            : (Number.isFinite(Number(user.sector_id)) && sectorNameById.get(Number(user.sector_id))
                ? [String(sectorNameById.get(Number(user.sector_id)))]
                : []),
      }))
    );
  });

  app.post("/api/users", requireRole("admin"), async (req, res) => {
    const { name, email, password, role, sector_id, sector_ids } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      role?: "admin" | "finance" | "controle" | "manager" | "viewer";
      sector_id?: number | null;
      sector_ids?: number[];
    };

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "name, email, password e role são obrigatórios" });
    }

    if (!["admin", "finance", "controle", "manager", "viewer"].includes(role)) {
      return res.status(400).json({ error: "role inválido" });
    }

    // Validação de formato e política de senha.
    const normalizedEmail = String(email).trim().toLowerCase();
    if (String(name).trim().length < 2 || String(name).length > 120) {
      return res.status(400).json({ error: "Nome inválido." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 160) {
      return res.status(400).json({ error: "E-mail inválido." });
    }
    const pwdError = validatePasswordStrength(String(password));
    if (pwdError) return res.status(400).json({ error: pwdError });

    const normalizedSectorIds = Array.from(
      new Set(
        (Array.isArray(sector_ids) ? sector_ids : [sector_id])
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value))
      )
    );

    const hashedPassword = await hashPassword(String(password));
    const { data, error } = await supabase
      .from("users")
      .insert({
        name: String(name).trim(),
        email: normalizedEmail,
        password: hashedPassword,
        role,
        sector_id: normalizedSectorIds.length ? normalizedSectorIds[0] : null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Erro ao criar usuário:", error);
      const detail = String(error.message || "").toLowerCase();
      if (detail.includes("duplicate") || detail.includes("unique")) {
        return res.status(409).json({ error: "Já existe um usuário com este e-mail." });
      }
      if (detail.includes("role") || detail.includes("check")) {
        return res.status(400).json({
          error: "O banco ainda não aceita esse perfil. Atualize a constraint de role no Supabase.",
        });
      }
      return res.status(400).json({ error: "Não foi possível criar o usuário." });
    }

    if (normalizedSectorIds.length) {
      const { error: userSectorsError } = await supabase
        .from("user_sectors")
        .upsert(
          normalizedSectorIds.map((sid) => ({ user_id: data.id, sector_id: sid })),
          { onConflict: "user_id,sector_id", ignoreDuplicates: true }
        );

      if (userSectorsError) {
        console.error("Erro ao salvar setores do usuário:", userSectorsError);
        return res.status(500).json({
          error: "Usuário criado, mas não foi possível salvar os setores. Verifique a migração user_sectors.",
        });
      }
    }

    res.json({ id: data.id });
  });

  app.patch("/api/users/:id", requireRole("admin"), async (req, res) => {
    const { id } = req.params;
    const { name, email, password, role, sector_id, sector_ids } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      role?: "admin" | "finance" | "controle" | "manager" | "viewer";
      sector_id?: number | null;
      sector_ids?: number[];
    };

    if (!name || !email || !role) {
      return res.status(400).json({ error: "name, email e role são obrigatórios" });
    }
    if (!["admin", "finance", "controle", "manager", "viewer"].includes(role)) {
      return res.status(400).json({ error: "role inválido" });
    }

    if (!id || String(id).trim() === "") {
      return res.status(400).json({ error: "id do usuário é obrigatório" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (String(name).trim().length < 2 || String(name).length > 120) {
      return res.status(400).json({ error: "Nome inválido." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 160) {
      return res.status(400).json({ error: "E-mail inválido." });
    }

    const normalizedSectorIds = Array.from(
      new Set(
        (Array.isArray(sector_ids) ? sector_ids : [sector_id])
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value))
      )
    );

    const payload: any = {
      name: String(name).trim(),
      email: normalizedEmail,
      role,
      sector_id: normalizedSectorIds.length ? normalizedSectorIds[0] : null,
    };
    // Só atualiza a senha se enviada — e aplicando política + hash.
    if (password && String(password).trim()) {
      const pwdError = validatePasswordStrength(String(password));
      if (pwdError) return res.status(400).json({ error: pwdError });
      payload.password = await hashPassword(String(password));
    }

    const { error } = await supabase
      .from("users")
      .update(payload)
      .eq("id", id);

    if (error) {
      console.error("Erro ao atualizar usuário:", error);
      return res.status(400).json({ error: "Não foi possível atualizar o usuário." });
    }

    const { error: deleteLinksError } = await supabase.from("user_sectors").delete().eq("user_id", id);
    if (deleteLinksError) {
      console.error("Erro ao limpar setores do usuário:", deleteLinksError);
      return res.status(500).json({
        error: "Usuário atualizado, mas não foi possível atualizar os setores.",
      });
    }

    if (normalizedSectorIds.length) {
      const { error: upsertLinksError } = await supabase
        .from("user_sectors")
        .upsert(
          normalizedSectorIds.map((sid) => ({ user_id: id, sector_id: sid })),
          { onConflict: "user_id,sector_id", ignoreDuplicates: true }
        );

      if (upsertLinksError) {
        console.error("Erro ao salvar setores do usuário:", upsertLinksError);
        return res.status(500).json({
          error: "Usuário atualizado, mas não foi possível salvar os setores.",
        });
      }
    }

    res.json({ success: true });
  });

  app.delete("/api/users/:id", requireRole("admin"), async (req, res) => {
    const { id } = req.params;

    if (!id || String(id).trim() === "") {
      return res.status(400).json({ error: "id do usuário é obrigatório" });
    }

    // O ator é o usuário autenticado (token), nunca um campo do corpo da requisição.
    if (String(req.user!.id) === String(id)) {
      return res.status(400).json({ error: "Você não pode excluir seu próprio usuário" });
    }

    const { error } = await supabase
      .from("users")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Erro ao excluir usuário:", error);
      return res.status(400).json({ error: "Não foi possível excluir o usuário." });
    }
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
      console.error("Health check Supabase falhou:", error);
      return res.status(500).json({
        ok: false,
        message: "Falha ao conectar no Supabase",
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
    const selectedMonth = Number(month) || now.getMonth() + 1;
    const selectedYear = Number(year) || now.getFullYear();
    const { dateFrom, dateTo } = getMonthDateRange(selectedYear, selectedMonth);

    const [{ data: allRevenue }, { data: allExpenses }, { data: monthRevenue }, { data: monthExpenses }] =
      await Promise.all([
        supabase.from("financial_records").select("amount").eq("type", "revenue"),
        supabase.from("financial_records").select("amount").eq("type", "expense"),
        supabase
          .from("financial_records")
          .select("amount")
          .eq("type", "revenue")
          .gte("date", dateFrom)
          .lte("date", dateTo),
        supabase
          .from("financial_records")
          .select("amount")
          .eq("type", "expense")
          .gte("date", dateFrom)
          .lte("date", dateTo),
      ]);

    const totalRevenue = (allRevenue ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
    const totalExpenses = (allExpenses ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
    const monthlyRevenue = (monthRevenue ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
    const monthlyExpenses = (monthExpenses ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
    const monthlyProfit = (monthlyRevenue - monthlyExpenses) * 0.8;

    res.json({
      month: selectedMonth,
      year: selectedYear,
      receitaMensal: monthlyRevenue,
      receitaAcumulada: totalRevenue,
      faturamentoMensal: monthlyRevenue * 1.1,
      faturamentoAcumulado: totalRevenue * 1.1,
      saldo: totalRevenue - totalExpenses,
      lucro: monthlyProfit,
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
  // APURAÇÃO DE RECEITA
  // ====================================================
  app.get("/api/apuracao/receita", requireRole("admin", "finance", "controle"), async (req, res) => {
    const year = Number((req.query as { year?: string }).year) || new Date().getFullYear();
    const dateFrom = `${year}-01-01`;
    const dateTo = `${year}-12-31`;
    const monthLabels = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
    ];

    const { data, error } = await supabase
      .from("financial_records")
      .select("amount, type, date")
      .gte("date", dateFrom)
      .lte("date", dateTo);

    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Não foi possível carregar a apuração de receita." });
    }

    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      label: monthLabels[i],
      receita: 0,
      despesa: 0,
      resultado: 0,
    }));

    for (const row of data ?? []) {
      const d = String((row as any).date ?? "");
      const m = Number(d.slice(5, 7));
      if (m < 1 || m > 12) continue;
      const amount = Number((row as any).amount) || 0;
      const type = String((row as any).type ?? "");
      if (type === "revenue") months[m - 1].receita += amount;
      else if (type === "expense") months[m - 1].despesa += amount;
    }

    for (const m of months) {
      m.resultado = m.receita - m.despesa;
    }

    res.json({
      year,
      months,
      totals: months.reduce(
        (acc, m) => ({
          receita: acc.receita + m.receita,
          despesa: acc.despesa + m.despesa,
          resultado: acc.resultado + m.resultado,
        }),
        { receita: 0, despesa: 0, resultado: 0 }
      ),
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

    if (error) { console.error(error); return res.status(500).json({ error: "Erro interno ao processar a solicitação." }); }

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

    if (error) { console.error(error); return res.status(500).json({ error: "Erro interno ao processar a solicitação." }); }

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
    let monthlyValues: any[] = [];
    const allowedCrdIds = new Set(crdIds);

    if (crdIds.length) {
      const { rows, error: monthlyError } = await fetchMonthlyValuesByYear(selectedYear);
      monthlyValues = rows ?? [];

      if (monthlyError) {
        const isMissingTable =
          monthlyError.message?.toLowerCase().includes("relation") &&
          monthlyError.message?.includes("crd_monthly_values");
        if (!isMissingTable) return res.status(500).json({ error: monthlyError.message });
      }

      for (const row of monthlyValues) {
        if (Number((row as any).month) !== selectedMonth) continue;
        const crdId = Number((row as any).crd_id);
        if (!allowedCrdIds.has(crdId)) continue;
        const value = sanitizeMonthBudget((row as any).value);
        monthlyValueByCrdId.set(crdId, value);
        const sectorCodeKey = crdIdToSectorCodeKey.get(crdId);
        if (sectorCodeKey) monthlyValueBySectorCodeKey.set(sectorCodeKey, value);
      }
    }

    const valuesByCrdMonth = new Map<string, number>();
    for (const row of monthlyValues) {
      const crdId = Number((row as any).crd_id);
      const month = Number((row as any).month);
      if (!allowedCrdIds.has(crdId) || month < 1 || month > 12) continue;
      valuesByCrdMonth.set(`${crdId}|${month}`, sanitizeMonthBudget((row as any).value));
    }

    const budgetBySectorId = new Map<number, number>();
    const annualBudgetBySectorId = new Map<number, number>();
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

      let annualCrdSum = 0;
      for (let m = 1; m <= 12; m++) {
        annualCrdSum += valuesByCrdMonth.get(`${crdId}|${m}`) ?? defaultValue;
      }
      annualBudgetBySectorId.set(
        sectorId,
        (annualBudgetBySectorId.get(sectorId) || 0) + annualCrdSum * occupancyFactor
      );
    }

    const yearDateFrom = `${selectedYear}-01-01`;
    const yearDateTo = `${selectedYear}-12-31`;
    const [{ data: yearInvoices }, { data: yearReqs }, { data: yearManual }] = await Promise.all([
      supabase
        .from("invoices")
        .select("sector_id, amount")
        .gte("due_date", yearDateFrom)
        .lte("due_date", yearDateTo)
        .or("flow_stage.is.null,flow_stage.neq.cancelled"),
      supabase
        .from("requisitions")
        .select("sector_id, amount")
        .eq("status", "open")
        .gte("date", yearDateFrom)
        .lte("date", yearDateTo),
      supabase
        .from("manual_entries")
        .select("sector_id, amount")
        .in("status", ["open", "approved"])
        .gte("date", yearDateFrom)
        .lte("date", yearDateTo),
    ]);

    const annualInvoicesBySector = new Map<number, number>();
    for (const inv of yearInvoices ?? []) {
      const sectorId = Number((inv as any).sector_id);
      if (!Number.isFinite(sectorId)) continue;
      annualInvoicesBySector.set(
        sectorId,
        (annualInvoicesBySector.get(sectorId) || 0) + Number((inv as any).amount)
      );
    }
    const annualReqsBySector = new Map<number, number>();
    for (const req of yearReqs ?? []) {
      const sectorId = Number((req as any).sector_id);
      if (!Number.isFinite(sectorId)) continue;
      annualReqsBySector.set(
        sectorId,
        (annualReqsBySector.get(sectorId) || 0) + Number((req as any).amount)
      );
    }
    const annualManualBySector = new Map<number, number>();
    for (const entry of yearManual ?? []) {
      const sectorId = Number((entry as any).sector_id);
      if (!Number.isFinite(sectorId)) continue;
      annualManualBySector.set(
        sectorId,
        (annualManualBySector.get(sectorId) || 0) + Number((entry as any).amount)
      );
    }

    const enriched = await Promise.all(
      (sectors ?? []).map(async (sector: any) => {
        const [{ data: pendingInvoices }, { data: pendingReqs }, { data: pendingManual }] = await Promise.all([
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
          supabase
            .from("manual_entries")
            .select("amount")
            .eq("sector_id", sector.id)
            .in("status", ["open", "approved"])
            .gte("date", dateFrom)
            .lte("date", dateTo),
        ]);

        const pending_invoices = (pendingInvoices ?? []).reduce(
          (s: number, i: any) => s + Number(i.amount), 0
        );
        const pending_requisitions = (pendingReqs ?? []).reduce(
          (s: number, r: any) => s + Number(r.amount), 0
        );
        const pending_manual_entries = (pendingManual ?? []).reduce(
          (s: number, m: any) => s + Number(m.amount), 0
        );
        const sectorId = Number(sector.id);
        const annual_invoices = annualInvoicesBySector.get(sectorId) || 0;
        const annual_requisitions = annualReqsBySector.get(sectorId) || 0;
        const annual_manual_entries = annualManualBySector.get(sectorId) || 0;

        return {
          ...sector,
          pending_invoices,
          pending_requisitions,
          pending_manual_entries,
          pending_amount: pending_invoices + pending_requisitions + pending_manual_entries,
          budget_month: budgetBySectorId.get(sectorId) || 0,
          annual_invoices,
          annual_requisitions,
          annual_manual_entries,
          annual_pending_amount: annual_invoices + annual_requisitions + annual_manual_entries,
          annual_budget: annualBudgetBySectorId.get(sectorId) || 0,
          occupancy_percent: occupancyPercent,
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

    if (error) { console.error(error); return res.status(500).json({ error: "Erro interno ao processar a solicitação." }); }

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
      .select("id, sector_id, code")
      .eq("id", Number(crd_id))
      .single();
    if (crdError || !crd) {
      return res.status(400).json({ error: "CRD inválido para a requisição" });
    }

    const { data: userRow } = await supabase.from("users").select("*").eq("id", req.user!.id).single();
    if (userRow) {
      const session = await buildUserSession(userRow);
      const allowedSectorIds = session.sector_ids ?? [];
      const isGlobal = ["admin", "finance", "controle"].includes(String(userRow.role || ""));
      const shared = isSharedCrdCode((crd as any).code);

      if (!shared && (!isGlobal || allowedSectorIds.length > 0)) {
        if (allowedSectorIds.length === 0) {
          return res.status(403).json({ error: "Seu usuário não possui setor vinculado para lançar requisições." });
        }
        if (!allowedSectorIds.includes(Number(crd.sector_id))) {
          return res.status(403).json({ error: "CRD fora dos setores permitidos para seu usuário." });
        }
      }
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

    if (error) { console.error(error); return res.status(500).json({ error: "Erro interno ao processar a solicitação." }); }
    res.json({ id: data.id });
  });

  app.patch("/api/requisitions/:id/status", async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!["open", "cancelled", "posted"].includes(status))
      return res.status(400).json({ error: "Status inválido" });

    const { error } = await supabase.from("requisitions").update({ status }).eq("id", id);
    if (error) { console.error(error); return res.status(500).json({ error: "Erro interno ao processar a solicitação." }); }
    res.json({ success: true });
  });

  // ====================================================
  // LANÇAMENTOS MANUAIS
  // ====================================================
  const assertSectorAccessForUser = async (req: express.Request, sectorId: number) => {
    const { data: userRow } = await supabase.from("users").select("*").eq("id", req.user!.id).single();
    if (!userRow) return { ok: true as const };

    const session = await buildUserSession(userRow);
    const allowedSectorIds = session.sector_ids ?? [];
    const isGlobal = ["admin", "finance", "controle"].includes(String(userRow.role || ""));

    if (!isGlobal || allowedSectorIds.length > 0) {
      if (allowedSectorIds.length === 0) {
        return { ok: false as const, status: 403, error: "Seu usuário não possui setor vinculado para este lançamento." };
      }
      if (!allowedSectorIds.includes(Number(sectorId))) {
        return { ok: false as const, status: 403, error: "Setor fora dos permitidos para seu usuário." };
      }
    }
    return { ok: true as const };
  };

  app.get("/api/manual-entries", async (_req, res) => {
    const { data, error } = await supabase
      .from("manual_entries")
      .select("*, sectors(name), crds(id, code, name), users(id, name)")
      .order("date", { ascending: false });

    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Erro interno ao processar a solicitação." });
    }

    res.json(
      (data ?? []).map((row: any) => ({
        ...row,
        sector_name: row.sectors?.name ?? null,
        crd_code: row.crds?.code ?? null,
        crd_name: row.crds?.name ?? null,
        user_name: row.users?.name ?? null,
        sectors: undefined,
        crds: undefined,
        users: undefined,
      }))
    );
  });

  app.post("/api/manual-entries", async (req, res) => {
    const { sector_id, crd_id, description, amount, date, issue_date } = req.body;
    if (!sector_id || amount == null || !date || !issue_date) {
      return res.status(400).json({ error: "sector_id, amount, issue_date e date são obrigatórios" });
    }

    const sectorId = Number(sector_id);
    if (!Number.isFinite(sectorId)) {
      return res.status(400).json({ error: "Setor inválido" });
    }

    const access = await assertSectorAccessForUser(req, sectorId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    let resolvedCrdId: number | null = null;
    if (crd_id) {
      const { data: crd, error: crdError } = await supabase
        .from("crds")
        .select("id, sector_id, code")
        .eq("id", Number(crd_id))
        .single();
      if (crdError || !crd) {
        return res.status(400).json({ error: "CRD inválido para o lançamento" });
      }
      if (Number(crd.sector_id) !== sectorId && !isSharedCrdCode((crd as any).code)) {
        return res.status(400).json({ error: "CRD não pertence ao setor informado" });
      }
      resolvedCrdId = Number(crd.id);
    }

    const { data, error } = await supabase
      .from("manual_entries")
      .insert({
        sector_id: sectorId,
        crd_id: resolvedCrdId,
        user_id: req.user!.id,
        description: description || null,
        amount,
        issue_date,
        date,
        status: "open",
      })
      .select("id")
      .single();

    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Erro interno ao processar a solicitação." });
    }
    res.json({ id: data.id });
  });

  app.patch("/api/manual-entries/:id/status", async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!["open", "approved", "cancelled", "posted"].includes(status)) {
      return res.status(400).json({ error: "Status inválido" });
    }

    const { data: existing, error: fetchError } = await supabase
      .from("manual_entries")
      .select("id, sector_id, status")
      .eq("id", id)
      .single();
    if (fetchError || !existing) {
      return res.status(404).json({ error: "Lançamento não encontrado" });
    }

    const access = await assertSectorAccessForUser(req, Number(existing.sector_id));
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const role = String(req.user?.role || "");
    const isAdmin = role === "admin";
    const isControle = role === "controle" || isAdmin;
    const isFinance = role === "finance" || isAdmin;
    const current = String((existing as any).status || "open");

    // Fluxo: open → approved (Controle) → posted (Financeiro)
    // Cancelamento permitido em open/approved.
    if (status === "approved") {
      if (!isControle) return res.status(403).json({ error: "Apenas Controle (ou admin) pode aprovar." });
      if (current !== "open") return res.status(400).json({ error: "Só é possível aprovar lançamentos em aberto." });
    } else if (status === "posted") {
      if (!isFinance) return res.status(403).json({ error: "Apenas Financeiro (ou admin) pode baixar/pagar." });
      if (current !== "approved") return res.status(400).json({ error: "O lançamento precisa ser aprovado pelo Controle antes do pagamento." });
    } else if (status === "cancelled") {
      if (current === "posted") return res.status(400).json({ error: "Não é possível cancelar um lançamento já baixado." });
      if (!["open", "approved"].includes(current)) {
        return res.status(400).json({ error: "Este lançamento já está cancelado." });
      }
      // Controle pode reprovar (open→cancelled); solicitante/admin também podem cancelar.
      if (!(isControle || isAdmin || ["manager"].includes(role))) {
        // finance não cancela; managers and controle/admin ok
        if (role === "finance") return res.status(403).json({ error: "Financeiro não cancela lançamentos manuais." });
      }
    } else if (status === "open") {
      // Desaprovar: devolver approved → open (só Controle/admin)
      if (!isControle) return res.status(403).json({ error: "Apenas Controle (ou admin) pode devolver o lançamento." });
      if (current !== "approved") return res.status(400).json({ error: "Só é possível devolver lançamentos aprovados." });
    }

    const { error } = await supabase.from("manual_entries").update({ status }).eq("id", id);
    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Erro interno ao processar a solicitação." });
    }
    res.json({ success: true });
  });

  // Exclusão definitiva de lançamento manual (apenas admin)
  app.delete("/api/manual-entries/:id", requireRole("admin"), async (req, res) => {
    const { id } = req.params;
    const { data: existing, error: fetchError } = await supabase
      .from("manual_entries")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (fetchError) {
      console.error(fetchError);
      return res.status(500).json({ error: "Erro interno ao processar a solicitação." });
    }
    if (!existing) return res.status(404).json({ error: "Lançamento não encontrado" });

    const { error } = await supabase.from("manual_entries").delete().eq("id", id);
    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Não foi possível excluir o lançamento." });
    }
    res.json({ success: true });
  });

  // ====================================================
  // LOCAIS PDV (configurações / comandas)
  // ====================================================
  app.get("/api/pdv-locais", async (req, res) => {
    const includeInactive = String(req.query.all || "") === "1";
    let query = supabase
      .from("pdv_locais")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (!includeInactive) query = query.eq("active", true);

    const { data, error } = await query;
    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Erro interno ao processar a solicitação." });
    }
    res.json(data ?? []);
  });

  app.post("/api/pdv-locais", requireRole("admin"), async (req, res) => {
    const name = String(req.body?.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "Nome do local é obrigatório." });

    const { data: existing } = await supabase
      .from("pdv_locais")
      .select("id")
      .ilike("name", name)
      .maybeSingle();
    if (existing) return res.status(400).json({ error: "Já existe um local com este nome." });

    const { data: last } = await supabase
      .from("pdv_locais")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const sortOrder = Number((last as any)?.sort_order ?? 0) + 1;

    const { data, error } = await supabase
      .from("pdv_locais")
      .insert({ name, active: true, sort_order: sortOrder })
      .select("id, name, active, sort_order")
      .single();

    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Erro interno ao processar a solicitação." });
    }
    res.json(data);
  });

  app.patch("/api/pdv-locais/:id", requireRole("admin"), async (req, res) => {
    const { id } = req.params;
    const patch: Record<string, unknown> = {};
    if (req.body?.name != null) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: "Nome do local é obrigatório." });
      patch.name = name;
    }
    if (typeof req.body?.active === "boolean") patch.active = req.body.active;
    if (req.body?.sort_order != null) patch.sort_order = Number(req.body.sort_order);

    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: "Nenhum campo para atualizar." });
    }

    const { error } = await supabase.from("pdv_locais").update(patch).eq("id", id);
    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Erro interno ao processar a solicitação." });
    }
    res.json({ success: true });
  });

  app.delete("/api/pdv-locais/:id", requireRole("admin"), async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from("pdv_locais").delete().eq("id", id);
    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Erro interno ao processar a solicitação." });
    }
    res.json({ success: true });
  });

  // ====================================================
  // COMANDAS
  // ====================================================
  type ComandaItemInput = {
    description?: string;
    quantity?: number | string;
  };

  const normalizeComandaItems = (items: ComandaItemInput[]) => {
    if (!Array.isArray(items) || items.length === 0) {
      return { ok: false as const, error: "Informe ao menos um item consumido." };
    }

    const normalized = items.map((item, index) => {
      const description = String(item.description ?? "").trim();
      const quantity = Number(item.quantity);
      if (!description) {
        return { error: `Item ${index + 1}: descrição é obrigatória.` };
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return { error: `Item ${index + 1}: quantidade deve ser maior que zero.` };
      }
      return {
        description,
        quantity,
        unit_price: 0,
        total_amount: 0,
        sort_order: index,
      };
    });

    const invalid = normalized.find((row) => "error" in row) as { error: string } | undefined;
    if (invalid?.error) return { ok: false as const, error: invalid.error };

    return { ok: true as const, items: normalized as Array<{
      description: string;
      quantity: number;
      unit_price: number;
      total_amount: number;
      sort_order: number;
    }> };
  };

  const mapComandaRows = (rows: any[], items: any[]) => {
    const itemsByComanda = new Map<number, any[]>();
    for (const item of items) {
      const comandaId = Number(item.comanda_id);
      if (!Number.isFinite(comandaId)) continue;
      const list = itemsByComanda.get(comandaId) ?? [];
      list.push({
        id: item.id,
        description: item.description,
        quantity: Number(item.quantity),
        sort_order: Number(item.sort_order ?? 0),
      });
      itemsByComanda.set(comandaId, list);
    }

    return (rows ?? []).map((row: any) => {
      const comandaItems = (itemsByComanda.get(Number(row.id)) ?? []).sort(
        (a, b) => a.sort_order - b.sort_order
      );
      return {
        ...row,
        user_name: row.users?.name ?? null,
        items: comandaItems,
        items_count: comandaItems.length,
        users: undefined,
      };
    });
  };

  app.get("/api/comandas", async (_req, res) => {
    const { data: comandas, error } = await supabase
      .from("comandas")
      .select("*, users(id, name)")
      .order("consumed_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Erro interno ao processar a solicitação." });
    }

    const ids = (comandas ?? []).map((row: any) => Number(row.id)).filter((id) => Number.isFinite(id));
    if (!ids.length) return res.json([]);

    const { data: items, error: itemsError } = await supabase
      .from("comanda_items")
      .select("*")
      .in("comanda_id", ids)
      .order("sort_order", { ascending: true });

    if (itemsError) {
      console.error(itemsError);
      return res.status(500).json({ error: "Erro interno ao processar a solicitação." });
    }

    res.json(mapComandaRows(comandas ?? [], items ?? []));
  });

  app.post("/api/comandas", async (req, res) => {
    const { consumer_name, consumed_at, location, items } = req.body as {
      consumer_name?: string;
      consumed_at?: string;
      location?: string;
      items?: ComandaItemInput[];
    };

    const name = String(consumer_name ?? "").trim();
    const consumedDate = String(consumed_at ?? "").trim();
    const consumedLocation = String(location ?? "").trim();

    if (!name) return res.status(400).json({ error: "Nome do consumidor é obrigatório." });
    if (!consumedDate) return res.status(400).json({ error: "Data do consumo é obrigatória." });
    if (!consumedLocation) return res.status(400).json({ error: "Local do consumo é obrigatório." });

    const { data: pdvLocal } = await supabase
      .from("pdv_locais")
      .select("id, name")
      .eq("active", true)
      .ilike("name", consumedLocation)
      .maybeSingle();
    if (!pdvLocal) {
      return res.status(400).json({ error: "Selecione um local PDV válido cadastrado em Configurações." });
    }

    const parsedItems = normalizeComandaItems(items ?? []);
    if (!parsedItems.ok) return res.status(400).json({ error: parsedItems.error });

    const { data: comanda, error: comandaError } = await supabase
      .from("comandas")
      .insert({
        consumer_name: name,
        consumed_at: consumedDate,
        location: String(pdvLocal.name),
        user_id: req.user!.id,
        status: "open",
      })
      .select("id")
      .single();

    if (comandaError || !comanda) {
      console.error(comandaError);
      return res.status(500).json({ error: "Erro interno ao processar a solicitação." });
    }

    const itemRows = parsedItems.items.map((item) => ({
      comanda_id: comanda.id,
      ...item,
    }));

    const { error: itemsError } = await supabase.from("comanda_items").insert(itemRows);
    if (itemsError) {
      console.error(itemsError);
      await supabase.from("comandas").delete().eq("id", comanda.id);
      return res.status(500).json({ error: "Não foi possível salvar os itens da comanda." });
    }

    res.json({ id: comanda.id });
  });

  app.patch("/api/comandas/:id/status", async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!["open", "cancelled", "posted"].includes(status)) {
      return res.status(400).json({ error: "Status inválido" });
    }

    const { data: existing, error: fetchError } = await supabase
      .from("comandas")
      .select("id")
      .eq("id", id)
      .single();
    if (fetchError || !existing) {
      return res.status(404).json({ error: "Comanda não encontrada" });
    }

    const { error } = await supabase.from("comandas").update({ status }).eq("id", id);
    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Erro interno ao processar a solicitação." });
    }
    res.json({ success: true });
  });

  // ====================================================
  // INVOICES
  // ====================================================
  app.get("/api/invoices", async (req, res) => {
    const { month, year, from, to } = req.query as {
      month?: string;
      year?: string;
      from?: string;
      to?: string;
    };
    const now = new Date();

    let query = supabase
      .from("invoices")
      .select("*, sectors(name), users(name)")
      .order("created_at", { ascending: false });

    if (from || to) {
      const dateFrom = from || to!;
      const dateTo = to || from!;
      query = applyProvisionDateRange(query, dateFrom, dateTo);
    } else {
      const selectedMonth = Number(month) || now.getMonth() + 1;
      const selectedYear = Number(year) || now.getFullYear();
      const { dateFrom, dateTo } = getMonthDateRange(selectedYear, selectedMonth);
      query = applyProvisionDateRange(query, dateFrom, dateTo);
    }

    const { data, error } = await query;

    if (error) { console.error(error); return res.status(500).json({ error: "Erro interno ao processar a solicitação." }); }

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

  // Relatório CSV / PDF
  const invoiceFlowStageLabel = (stage: string) => {
    const map: Record<string, string> = {
      control_pending: "Aguardando Controle",
      control_approved: "Aprovado Controle",
      paid: "Pago",
      cancelled: "Cancelado",
    };
    return map[stage] || stage;
  };

  const formatReportCurrency = (value: unknown) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "";
    return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const fetchInvoiceReportRows = async (filters: {
    from?: string;
    to?: string;
    payment_method?: string;
  }) => {
    let query = supabase
      .from("invoices")
      .select("*, sectors(name), users(name)")
      .neq("flow_stage", "cancelled")
      .order("due_date", { ascending: true });

    if (filters.from) query = query.gte("due_date", filters.from);
    if (filters.to) query = query.lte("due_date", filters.to);
    if (filters.payment_method) query = query.eq("payment_method", filters.payment_method);

    const { data, error } = await query;
    if (error) throw error;

    return Promise.all(
      (data ?? []).map(async (i: any) => {
        const [fileUrl, boletoUrl, receiptUrl] = await Promise.all([
          i.file_path ? createSignedDocumentUrl(i.file_path) : Promise.resolve(null),
          i.boleto_file_path ? createSignedDocumentUrl(i.boleto_file_path) : Promise.resolve(null),
          i.payment_receipt_path ? createSignedDocumentUrl(i.payment_receipt_path) : Promise.resolve(null),
        ]);
        return {
          ...i,
          sector_name: i.sectors?.name ?? null,
          user_name: i.users?.name ?? null,
          file_url: fileUrl && "url" in fileUrl ? fileUrl.url : "",
          boleto_file_url: boletoUrl && "url" in boletoUrl ? boletoUrl.url : "",
          payment_receipt_url: receiptUrl && "url" in receiptUrl ? receiptUrl.url : "",
        };
      })
    );
  };

  const invoiceReportCsvHeader = [
    "id", "invoice_number", "provider_name", "sector_name", "user_name", "amount",
    "issue_date", "due_date", "payment_method", "pix_key", "flow_stage",
    "status", "natureza", "file_url", "boleto_file_url", "payment_receipt_url", "created_at",
  ];

  const buildInvoiceReportCsv = (rows: any[]) =>
    [
      invoiceReportCsvHeader.join(","),
      ...rows.map((r: any) => invoiceReportCsvHeader.map((k) => escapeCsv(r[k])).join(",")),
    ].join("\n");

  const buildInvoiceReportPdf = (
    rows: any[],
    filters: { from?: string; to?: string; payment_method?: string }
  ) =>
    new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 36, size: "A4", layout: "landscape" });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk as Buffer));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const columns = [
        { label: "Nota", width: 52 },
        { label: "Fornecedor", width: 118 },
        { label: "Setor", width: 72 },
        { label: "Valor", width: 68 },
        { label: "Venc.", width: 52 },
        { label: "Pagamento", width: 58 },
        { label: "Pix", width: 88 },
        { label: "Status", width: 78 },
      ];
      const startX = doc.page.margins.left;
      let y = doc.page.margins.top;

      const drawTableHeader = () => {
        let x = startX;
        doc.save();
        doc.rect(startX, y - 2, pageWidth, 16).fill("#004D40");
        doc.restore();
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff");
        for (const col of columns) {
          doc.text(col.label, x + 2, y, { width: col.width - 4, lineBreak: false });
          x += col.width + 4;
        }
        y += 16;
      };

      const ensureSpace = (height = 14) => {
        if (y + height <= doc.page.height - doc.page.margins.bottom) return;
        doc.addPage({ size: "A4", layout: "landscape", margin: 36 });
        y = doc.page.margins.top;
        drawTableHeader();
      };

      doc.font("Helvetica-Bold").fontSize(14).fillColor("#004D40")
        .text("Relatório de Notas para Pagamento", startX, y, { width: pageWidth, align: "center" });
      y = doc.y + 8;

      doc.font("Helvetica").fontSize(9).fillColor("#444444");
      const filterParts: string[] = [];
      if (filters.from || filters.to) {
        filterParts.push(`Vencimento: ${filters.from || "..."} até ${filters.to || "..."}`);
      }
      if (filters.payment_method) filterParts.push(`Pagamento: ${filters.payment_method}`);
      doc.text(filterParts.length ? filterParts.join("  •  ") : "Todas as notas não canceladas", startX, y);
      y = doc.y + 2;
      doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}  •  ${rows.length} nota(s)`, startX, y);
      y = doc.y + 10;

      drawTableHeader();

      for (const row of rows) {
        ensureSpace();
        let x = startX;
        doc.font("Helvetica").fontSize(8).fillColor("#222222");
        const cells = [
          String(row.invoice_number || ""),
          String(row.provider_name || ""),
          String(row.sector_name || ""),
          formatReportCurrency(row.amount),
          String(row.due_date || ""),
          String(row.payment_method || ""),
          String(row.pix_key || ""),
          invoiceFlowStageLabel(String(row.flow_stage || row.status || "")),
        ];
        for (let i = 0; i < columns.length; i++) {
          doc.text(cells[i], x + 2, y, { width: columns[i].width - 4, lineBreak: false, ellipsis: true });
          x += columns[i].width + 4;
        }
        y += 14;
      }

      ensureSpace(24);
      const total = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#004D40")
        .text(`Total: ${formatReportCurrency(total)}`, startX, y + 4, { width: pageWidth, align: "right" });

      doc.end();
    });

  app.get("/api/invoices/report", async (req, res) => {
    const { from, to, payment_method, format } = req.query as {
      from?: string;
      to?: string;
      payment_method?: string;
      format?: string;
    };
    const exportFormat = String(format || "csv").toLowerCase();

    try {
      const rows = await fetchInvoiceReportRows({ from, to, payment_method });
      const stamp = new Date().toISOString().slice(0, 10);

      if (exportFormat === "pdf") {
        const pdf = await buildInvoiceReportPdf(rows, { from, to, payment_method });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="relatorio-notas-${stamp}.pdf"`);
        return res.send(pdf);
      }

      const csv = buildInvoiceReportCsv(rows);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="relatorio-notas-${stamp}.csv"`);
      res.send("\uFEFF" + csv);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Erro interno ao processar a solicitação." });
    }
  });

  // Upload PDF e extração
  app.post("/api/invoices/extract", upload.single("invoice_pdf"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "PDF não enviado" });

    if (req.file.mimetype !== "application/pdf") {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, error: "Formato inválido. Envie a nota em PDF." });
    }

    try {
      const fileBuffer = fs.readFileSync(req.file.path);

      let storagePath: string;
      try {
        storagePath = await uploadDocument(fileBuffer, "invoices", "pdf", "application/pdf");
      } catch (uploadError) {
        console.error("Erro ao salvar PDF no storage:", uploadError);
        return res.status(500).json({ success: false, error: "Não foi possível salvar o PDF." });
      }

      let parseWarning = "";
      let parseErrorDetail = "";

      try {
        const pdfParse = await loadPdfParse();
        const parsed = await pdfParse(fileBuffer);
        const text = (parsed.text || "").replace(/\u00A0/g, " ");
        const extracted = parseInvoicePdfText(text);

        const hasData = Boolean(
          extracted.invoice_number ||
          extracted.provider_name ||
          extracted.amount ||
          extracted.issue_date
        );
        if (!hasData) {
          parseWarning = "PDF salvo, mas não foi possível extrair os campos automaticamente. Preencha manualmente.";
        }

        res.json({
          success: true,
          warning: parseWarning || undefined,
          parse_error: parseErrorDetail || undefined,
          extracted: {
            invoice_number: extracted.invoice_number,
            provider_name: extracted.provider_name,
            client_name: extracted.client_name,
            issue_date: extracted.issue_date,
            due_date: extracted.due_date,
            amount: extracted.amount,
            pix_key: extracted.pix_key,
            payment_method: extracted.payment_method,
            description: extracted.description,
          },
          file_path: storagePath,
        });
      } catch (parseError: any) {
        parseWarning = "PDF salvo, mas não foi possível extrair os campos automaticamente. Preencha manualmente.";
        parseErrorDetail = parseError?.message || "Falha desconhecida na leitura do PDF";

        res.json({
          success: true,
          warning: parseWarning,
          parse_error: parseErrorDetail,
          extracted: {
            invoice_number: "",
            provider_name: "",
            client_name: "",
            issue_date: "",
            due_date: "",
            amount: "",
            pix_key: "",
            payment_method: "",
            description: "",
          },
          file_path: storagePath,
        });
      }
    } catch (error: any) {
      console.error("Erro ao processar PDF de nota:", error);
      res.status(500).json({
        success: false,
        error: "Não foi possível processar o PDF.",
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

    try {
      const fileBuffer = fs.readFileSync(req.file.path);
      const ext = req.file.mimetype === "application/pdf" ? "pdf" : req.file.mimetype.split("/")[1];
      const storagePath = await uploadDocument(fileBuffer, "receipts", ext, req.file.mimetype);
      res.json({ file_path: storagePath });
    } catch (error) {
      console.error("Erro ao salvar comprovante:", error);
      res.status(500).json({ error: "Não foi possível salvar o comprovante." });
    } finally {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    }
  });

  // Upload boleto
  app.post("/api/invoices/boleto", upload.single("boleto_file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Boleto não enviado" });
    if (req.file.mimetype !== "application/pdf") {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Formato inválido. Envie o boleto em PDF." });
    }

    try {
      const fileBuffer = fs.readFileSync(req.file.path);
      const storagePath = await uploadDocument(fileBuffer, "boletos", "pdf", "application/pdf");
      res.json({ file_path: storagePath });
    } catch (error) {
      console.error("Erro ao salvar boleto:", error);
      res.status(500).json({ error: "Não foi possível salvar o boleto." });
    } finally {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    }
  });

  // Gera uma URL assinada (curta) para abrir um documento do bucket privado.
  app.get("/api/storage/signed-url", async (req, res) => {
    const rawPath = String(req.query?.path || "");
    const result = await createSignedDocumentUrl(rawPath);
    if (!("url" in result)) {
      const status = result.error === "Caminho inválido" ? 400 : 404;
      return res.status(status).json({ error: result.error });
    }
    res.json({ url: result.url });
  });

  // URL assinada a partir do registro da nota (path gravado no Supabase).
  app.get("/api/invoices/:id/document-url", async (req, res) => {
    const field = String(req.query?.field || "file_path") as StorageDocumentField;
    const allowed: StorageDocumentField[] = ["file_path", "boleto_file_path", "payment_receipt_path"];
    if (!allowed.includes(field)) {
      return res.status(400).json({ error: "Campo inválido" });
    }

    const { data, error } = await supabase
      .from("invoices")
      .select(field)
      .eq("id", Number(req.params.id))
      .maybeSingle();

    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Erro ao buscar documento da nota." });
    }
    if (!data) return res.status(404).json({ error: "Nota não encontrada" });

    const rawPath = String((data as Record<string, unknown>)[field] || "");
    if (!rawPath) return res.status(404).json({ error: "Documento não anexado" });

    const result = await createSignedDocumentUrl(rawPath);
    if (!("url" in result)) {
      const status = result.error === "Caminho inválido" ? 400 : 404;
      return res.status(status).json({ error: result.error });
    }
    res.json({ url: result.url });
  });

  // Criar nota fiscal
  app.post("/api/invoices", async (req, res) => {
    const {
      invoice_number, provider_name, amount, issue_date, due_date,
      sector_id, file_path, boleto_file_path, natureza,
      crd, payment_method, pix_key,
    } = req.body;

    const launchedByUserId = req.user?.id ?? null;

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        invoice_number, provider_name, amount, issue_date, due_date,
        sector_id,
        user_id: launchedByUserId,
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

    if (error) { console.error(error); return res.status(500).json({ error: "Erro interno ao processar a solicitação." }); }
    res.json({ id: data.id });
  });

  // Ações de fluxo (aprovar / reprovar / desaprovar / pagar / cancelar)
  app.patch("/api/invoices/:id/flow", async (req, res) => {
    const { id } = req.params;
    const { action, actorSector, payment_receipt_path, cancel_reason } = req.body as {
      action?: "approve_control" | "reject_control" | "disapprove_control" | "mark_paid" | "cancel_request";
      actorSector?: string;
      payment_receipt_path?: string;
      cancel_reason?: string;
    };

    const role = String(req.user?.role || "");
    const isAdmin = role === "admin";
    const isControle = role === "controle" || isAdmin;
    const isFinance = role === "finance" || isAdmin;

    if (["approve_control", "reject_control", "disapprove_control"].includes(String(action)) && !isControle) {
      return res.status(403).json({ error: "Apenas Controle (ou admin) pode executar esta ação." });
    }
    if (action === "mark_paid" && !isFinance) {
      return res.status(403).json({ error: "Apenas Financeiro (ou admin) pode marcar como pago." });
    }

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
      if (error) { console.error(error); return res.status(500).json({ error: "Erro interno ao processar a solicitação." }); }
      return res.json({ success: true });
    }

    if (action === "reject_control") {
      if ((invoice.flow_stage || "control_pending") !== "control_pending")
        return res.status(400).json({ error: "Só é possível reprovar notas aguardando o Controle" });
      const { error } = await supabase.from("invoices").update({
        flow_stage: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by_sector: actorSector || "CONTROLE",
        cancel_reason: cancel_reason || "Reprovada pelo Controle",
      }).eq("id", id);
      if (error) { console.error(error); return res.status(500).json({ error: "Erro interno ao processar a solicitação." }); }
      return res.json({ success: true });
    }

    if (action === "disapprove_control") {
      if ((invoice.flow_stage || "control_pending") !== "control_approved")
        return res.status(400).json({ error: "Só é possível desaprovar notas já aprovadas pelo Controle" });
      const { error } = await supabase.from("invoices").update({
        flow_stage: "control_pending",
        approved_at: null,
        approved_by_sector: null,
      }).eq("id", id);
      if (error) { console.error(error); return res.status(500).json({ error: "Erro interno ao processar a solicitação." }); }
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
      if (error) { console.error(error); return res.status(500).json({ error: "Erro interno ao processar a solicitação." }); }
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
      if (error) { console.error(error); return res.status(500).json({ error: "Erro interno ao processar a solicitação." }); }
      return res.json({ success: true });
    }

    res.status(400).json({ error: "Ação inválida" });
  });

  // Exclusão definitiva de nota (apenas admin)
  app.delete("/api/invoices/:id", requireRole("admin"), async (req, res) => {
    const { id } = req.params;
    const { data: existing, error: fetchError } = await supabase
      .from("invoices")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (fetchError) {
      console.error(fetchError);
      return res.status(500).json({ error: "Erro interno ao processar a solicitação." });
    }
    if (!existing) return res.status(404).json({ error: "Nota não encontrada" });

    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Não foi possível excluir a nota." });
    }
    res.json({ success: true });
  });

  // ====================================================
  // CATEGORIES
  // ====================================================
  app.get("/api/categories", async (_req, res) => {
    const { data, error } = await supabase.from("categories").select("*");
    if (error) { console.error(error); return res.status(500).json({ error: "Erro interno ao processar a solicitação." }); }
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
    if (error) { console.error(error); return res.status(500).json({ error: "Erro interno ao processar a solicitação." }); }
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

    // Filtro por setor: inclui também CRDs compartilhados (ex.: 326).
    if (sector_id && Number.isFinite(Number(sector_id))) {
      const { data, error } = await supabase
        .from("crds")
        .select("*, sectors(name)")
        .order("active", { ascending: false })
        .order("code");
      if (error) { console.error(error); return res.status(500).json({ error: "Erro interno ao processar a solicitação." }); }

      const sectorIdNum = Number(sector_id);
      const filtered = (data ?? []).filter(
        (r: any) => Number(r.sector_id) === sectorIdNum || isSharedCrdCode(r.code)
      );
      return res.json(
        filtered.map((r: any) => ({
          ...r,
          sector_name: r.sectors?.name ?? null,
          sectors: undefined,
        }))
      );
    }

    const { data, error } = await query;
    if (error) { console.error(error); return res.status(500).json({ error: "Erro interno ao processar a solicitação." }); }

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
      await logImportHistory({
        source_type: "crds",
        file_name: req.file.originalname,
        status: "success",
        records_count: payload.length,
        user: req.user,
        summary: {
          imported: payload.length,
          groups: uniqueGroupNames.length,
          created_groups: createdGroups.length,
        },
      });
      res.json({
        success: true,
        imported: payload.length,
        groups: uniqueGroupNames.length,
        created_groups: createdGroups.length,
      });
    } catch (error: any) {
      console.error("Erro ao importar CRDs:", error);
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      await logImportHistory({
        source_type: "crds",
        file_name: req.file?.originalname,
        status: "error",
        user: req.user,
        error_message: String(error?.message || "Erro ao importar CRDs.").slice(0, 500),
      });
      res.status(500).json({ error: "Erro ao importar CRDs." });
    }
  });

  // ====================================================
  // IMPORTAÇÃO DE RELATÓRIOS (DESBRAVADOR)
  // ====================================================
  app.get("/api/import/history", requireRole("admin", "finance", "controle"), async (req, res) => {
    const { source_type, year, limit } = req.query as { source_type?: string; year?: string; limit?: string };
    const max = Math.min(Math.max(Number(limit) || 50, 1), 200);

    let query = supabase.from("import_history").select("*").order("created_at", { ascending: false }).limit(max);
    if (source_type?.trim()) query = query.eq("source_type", source_type.trim());
    if (year && Number.isFinite(Number(year))) query = query.eq("year", Number(year));

    const { data, error } = await query;
    if (error) {
      const detail = String(error.message || "");
      if (detail.toLowerCase().includes("import_history")) {
        return res.status(503).json({
          error: "Tabela import_history não encontrada. Execute sql/create_import_history.sql no Supabase.",
          detail,
        });
      }
      return res.status(500).json({ error: detail || "Erro ao carregar histórico de importações." });
    }
    res.json(data ?? []);
  });

  app.post("/api/import/desbravador/preview", upload.single("report_pdf"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Relatório PDF não enviado" });
    if (req.file.mimetype !== "application/pdf") {
      if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Formato inválido. Envie um PDF." });
    }

    const { month, year } = req.body as { month?: string; year?: string };

    try {
      const fileBuffer = fs.readFileSync(req.file.path);
      const pdfParse = await loadPdfParse();
      const parsed = await pdfParse(fileBuffer);
      const parsedLines = parseDesbravadorPdfLines(parsed.text || "");
      res.json(buildImportPreviewPayload(parsedLines, req.file.originalname || "relatorio-desbravador.pdf", month, year));
    } catch (error: any) {
      console.error("Erro ao processar PDF do Desbravador:", error);
      res.status(500).json({
        success: false,
        error: "Não foi possível processar o relatório PDF do Desbravador.",
      });
    } finally {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    }
  });

  app.post("/api/import/desbravador/preview-excel", upload.single("report_excel"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Relatório Excel não enviado" });
    const allowedMimes = new Set([
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/octet-stream",
    ]);
    const isExcelByExt = /\.(xlsx|xls)$/i.test(String(req.file.originalname || ""));
    if (!allowedMimes.has(req.file.mimetype) && !isExcelByExt) {
      if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Formato inválido. Envie um arquivo .xlsx ou .xls." });
    }

    const {
      month,
      year,
      description_column_index,
      value_column_index,
    } = req.body as {
      month?: string;
      year?: string;
      description_column_index?: string;
      value_column_index?: string;
    };

    try {
      const workbook = xlsx.readFile(req.file.path);
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json(firstSheet, { header: 1, defval: "" }) as any[][];
      const sampleHeaderRow = (rows || []).find((row) => Array.isArray(row) && row.some((cell) => String(cell || "").trim().length > 0)) || [];
      const columns = (sampleHeaderRow as any[]).map((name, index) => ({
        index,
        name: String(name || `Coluna ${index + 1}`).trim() || `Coluna ${index + 1}`,
      }));

      const parsedDescriptionCol = Number(description_column_index);
      const parsedValueCol = Number(value_column_index);
      const hasManualMapping = Number.isInteger(parsedDescriptionCol) && Number.isInteger(parsedValueCol);
      const parsedLines = hasManualMapping
        ? parseDesbravadorExcelLinesWithColumns(rows, parsedDescriptionCol, parsedValueCol)
        : parseDesbravadorExcelLines(rows);

      const normalizedHeaders = (sampleHeaderRow as any[]).map((cell) => normalizeExcelHeader(cell));
      const suggestedDescriptionCol = normalizedHeaders.findIndex((cell) =>
        /descricao|historico|conta|categoria|item|nome/.test(cell)
      );
      const suggestedValueCol = normalizedHeaders.findIndex((cell) =>
        /valor|realizado|total|montante|saldo|vr/.test(cell)
      );

      res.json({
        ...buildImportPreviewPayload(parsedLines, req.file.originalname || "relatorio-desbravador.xlsx", month, year),
        mapping: {
          columns,
          used_manual_mapping: hasManualMapping,
          description_column_index: hasManualMapping ? parsedDescriptionCol : suggestedDescriptionCol,
          value_column_index: hasManualMapping ? parsedValueCol : suggestedValueCol,
        },
      });
    } catch (error: any) {
      console.error("Erro ao processar Excel do Desbravador:", error);
      res.status(500).json({
        success: false,
        error: "Não foi possível processar o relatório Excel do Desbravador.",
      });
    } finally {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    }
  });

  // ====================================================
  // IMPORTAÇÃO: CONSUMO INTERNO (relatório "Consumo por cliente" do Desbravador, .xls)
  // Por enquanto apenas extrai e devolve os dados para visualização (não persiste).
  // ====================================================
  // Conta/setor de destino do Consumo Interno na Prev x Real.
  const CONSUMO_INTERNO_CRD_NOME = "CONSUMO INTERNO (SEM CRD)";
  const CONSUMO_INTERNO_SETOR = "Controle";

  // Faz o parse do .xls de Consumo Interno: linhas + resumo + período detectado.
  const parseConsumoInternoFile = (filePath: string) => {
    const excelDate = (serial: any): { br: string; iso: string } => {
      if (typeof serial !== "number" || !Number.isFinite(serial)) return { br: "", iso: "" };
      const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
      if (Number.isNaN(d.getTime())) return { br: "", iso: "" };
      const dd = String(d.getUTCDate()).padStart(2, "0");
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const yyyy = d.getUTCFullYear();
      return { br: `${dd}/${mm}/${yyyy}`, iso: `${yyyy}-${mm}-${dd}` };
    };
    const num = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true }) as any[][];

    let clienteId: any = null;
    let clienteNome = "";
    const lines: any[] = [];
    for (const r of rows) {
      if (!Array.isArray(r)) continue;
      if (String(r[0]).trim() === "Cliente:") {
        clienteId = r[1] ?? null;
        clienteNome = String(r[3] ?? "").trim();
        continue;
      }
      if (typeof r[0] === "number" && String(r[1]).trim() === "-" && String(r[2] ?? "").trim()) {
        const d = excelDate(r[10]);
        lines.push({
          cliente_id: clienteId,
          cliente_nome: clienteNome,
          produto_codigo: r[0],
          produto: String(r[2]).trim(),
          unidade: String(r[6] ?? "").trim(),
          nf: r[9] ?? null,
          data: d.br,
          data_iso: d.iso,
          quantidade: num(r[12]),
          vl_unitario: num(r[13]),
          vl_total: num(r[14]),
          vl_desconto: num(r[16]),
          taxa_servico: num(r[18]),
          vl_liquido: num(r[20]),
          forma_pgto: String(r[22] ?? "").trim(),
        });
      }
    }

    // Período = mês/ano mais frequente entre as datas dos lançamentos.
    const monthCount = new Map<string, number>();
    for (const l of lines) {
      if (l.data_iso) {
        const ym = String(l.data_iso).slice(0, 7);
        monthCount.set(ym, (monthCount.get(ym) || 0) + 1);
      }
    }
    let topYm = "";
    let topN = -1;
    for (const [ym, n] of monthCount) if (n > topN) { topN = n; topYm = ym; }
    const period = topYm ? { year: Number(topYm.slice(0, 4)), month: Number(topYm.slice(5, 7)) } : null;

    const totalLiquido = lines.reduce((s, l) => s + l.vl_liquido, 0);
    const totalQuantidade = lines.reduce((s, l) => s + l.quantidade, 0);
    const clientes = new Set(lines.map((l) => `${l.cliente_id}`));

    return {
      lines,
      period,
      summary: {
        lines_count: lines.length,
        clientes_count: clientes.size,
        total_quantidade: totalQuantidade,
        total_liquido: totalLiquido,
      },
    };
  };

  // Encontra (ou cria) o setor pelo nome.
  const resolveSectorIdByName = async (sectorName: string): Promise<number | null> => {
    const { data: sectors } = await supabase.from("sectors").select("id, name");
    const found = (sectors ?? []).find((s: any) => normalizeName(s.name) === normalizeName(sectorName));
    if (found) return Number((found as any).id);
    const { data: created, error } = await supabase
      .from("sectors")
      .insert({ name: sectorName, budget_limit: 0 })
      .select("id")
      .single();
    if (error || !created) {
      console.error("Falha ao criar setor:", sectorName, error);
      return null;
    }
    return Number(created.id);
  };

  // Encontra (ou cria) a CRD por nome dentro de um setor.
  const resolveCrdByNameAndSector = async (name: string, sectorName: string, code: string): Promise<number | null> => {
    const sectorId = await resolveSectorIdByName(sectorName);
    const { data: crds } = await supabase.from("crds").select("id, name, sector_id");
    const matches = (crds ?? []).filter((c: any) => normalizeName(c.name) === normalizeName(name));
    const chosen =
      matches.find((c: any) => sectorId != null && Number(c.sector_id) === sectorId) || matches[0];
    if (chosen) return Number((chosen as any).id);
    const { data: created, error } = await supabase
      .from("crds")
      .insert({ code, name, sector_id: sectorId, previsto_mes: 0, active: true })
      .select("id")
      .single();
    if (error || !created) {
      console.error("Falha ao criar CRD:", name, error);
      return null;
    }
    return Number(created.id);
  };

  app.post("/api/import/consumo-interno/preview", upload.single("consumo_file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Arquivo não enviado" });
    if (!/\.(xlsx|xls)$/i.test(req.file.originalname || "")) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Envie o relatório em Excel (.xls ou .xlsx)." });
    }
    try {
      const parsed = parseConsumoInternoFile(req.file.path);
      if (!parsed.lines.length) {
        return res.status(422).json({
          success: false,
          error:
            "O arquivo foi lido, mas nenhum item de consumo foi reconhecido. Confira se este é o relatório 'Consumo por cliente' do Desbravador — o layout parece diferente do esperado.",
        });
      }
      res.json({
        success: true,
        report_name: req.file.originalname || "consumo-interno.xls",
        period: parsed.period,
        summary: parsed.summary,
        lines: parsed.lines,
        destino: { setor: CONSUMO_INTERNO_SETOR, conta: CONSUMO_INTERNO_CRD_NOME },
      });
    } catch (error: any) {
      console.error("Erro ao processar Consumo Interno:", error);
      res.status(500).json({
        success: false,
        error: "Falha ao processar o relatório de Consumo Interno.",
        detail: error?.message ? String(error.message).slice(0, 300) : undefined,
      });
    } finally {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    }
  });

  // Envia o TOTAL do Consumo Interno como Realizado da conta "CONSUMO INTERNO (SEM CRD)"
  // (setor Controle) no mês detectado — aparece em Prev x Real > Controle > ... > Real.
  app.post("/api/import/consumo-interno/commit", requireRole("admin", "finance", "controle"), upload.single("consumo_file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Arquivo não enviado" });
    if (!/\.(xlsx|xls)$/i.test(req.file.originalname || "")) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Envie o relatório em Excel (.xls ou .xlsx)." });
    }
    try {
      const parsed = parseConsumoInternoFile(req.file.path);
      // Mês/ano: do corpo (override) ou do período detectado.
      const month = Number((req.body as any)?.month) || parsed.period?.month;
      const year = Number((req.body as any)?.year) || parsed.period?.year;
      if (!month || !year || month < 1 || month > 12) {
        return res.status(400).json({ error: "Não foi possível determinar o mês do relatório. Informe mês e ano." });
      }

      const crdId = await resolveCrdByNameAndSector(CONSUMO_INTERNO_CRD_NOME, CONSUMO_INTERNO_SETOR, "CONSUMO-INTERNO");
      if (!crdId) return res.status(500).json({ error: "Não foi possível resolver a conta de destino." });

      const total = parsed.summary.total_liquido;
      const { error } = await supabase
        .from("crd_realizado")
        .upsert(
          { crd_id: crdId, year, month, source: "consumo_interno", value: total },
          { onConflict: "crd_id,year,month,source" }
        );
      if (error) {
        console.error("Erro ao gravar realizado do Consumo Interno:", error);
        await logImportHistory({
          source_type: "consumo_interno",
          file_name: req.file.originalname,
          status: "error",
          year,
          month,
          user: req.user,
          error_message: String(error.message || "Não foi possível gravar o realizado.").slice(0, 500),
        });
        return res.status(500).json({ error: "Não foi possível gravar o realizado." });
      }

      await logImportHistory({
        source_type: "consumo_interno",
        file_name: req.file.originalname,
        status: "success",
        year,
        month,
        records_count: parsed.summary.lines_count,
        total_amount: total,
        user: req.user,
        summary: {
          destino: { setor: CONSUMO_INTERNO_SETOR, conta: CONSUMO_INTERNO_CRD_NOME },
          lines_count: parsed.summary.lines_count,
          clientes_count: parsed.summary.clientes_count,
        },
      });

      res.json({
        success: true,
        destino: { setor: CONSUMO_INTERNO_SETOR, conta: CONSUMO_INTERNO_CRD_NOME },
        period: { month, year },
        total,
      });
    } catch (error: any) {
      console.error("Erro no commit do Consumo Interno:", error);
      await logImportHistory({
        source_type: "consumo_interno",
        file_name: req.file?.originalname,
        status: "error",
        user: req.user,
        error_message: String(error?.message || "Não foi possível enviar o Consumo Interno.").slice(0, 500),
      });
      res.status(500).json({ error: "Não foi possível enviar o Consumo Interno." });
    } finally {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    }
  });

  // ====================================================
  // IMPORTAÇÃO: REL. CRD (Movimentação por Conta Financeira, .xls do Desbravador)
  // Extrai a hierarquia do plano financeiro (conta + movimentos). Não persiste ainda.
  // ====================================================
  app.post("/api/import/rel-crd/preview", upload.single("relcrd_file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Arquivo não enviado" });
    if (!/\.(xls|xlsx)$/i.test(req.file.originalname || "")) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Envie o relatório em Excel (.xls ou .xlsx)." });
    }
    // Aceita número ou texto BR ("2.345.821,13", "(85,00)", "-1.476,69").
    const parseVal = (v: any): number => {
      if (typeof v === "number") return Number.isFinite(v) ? v : 0;
      let s = String(v ?? "").trim();
      if (!s) return 0;
      const paren = /^\(.*\)$/.test(s);
      s = s.replace(/[()]/g, "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.\-]/g, "");
      let n = Number(s);
      if (!Number.isFinite(n)) n = 0;
      return paren ? -Math.abs(n) : n;
    };
    try {
      const workbook = xlsx.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true }) as any[][];

      const accounts: any[] = [];
      for (const r of rows) {
        const c0 = r[0];
        if (typeof c0 !== "string") continue;
        const t = c0.trim();
        const m = /\(([^)]+)\)\s*$/.exec(t); // conta termina com "(codigo)"
        if (!m) continue;
        if (r[9] === "" && r[24] === "") continue; // precisa ter colunas de movimento
        const lead = c0.length - c0.replace(/^\s+/, "").length; // espaços à esquerda = nível
        accounts.push({
          nivel: Math.floor(lead / 4) + 1,
          codigo: m[1],
          nome: t.replace(/\s*\([^)]+\)\s*$/, ""),
          lancamentos: parseVal(r[9]),
          cancelamentos: parseVal(r[11]),
          saldo_lanc: parseVal(r[14]),
          baixas: parseVal(r[16]),
          estorno: parseVal(r[19]),
          baixas_liquido: parseVal(r[21]),
          lanc_liquido: parseVal(r[24]),
        });
      }

      if (!accounts.length) {
        return res.status(422).json({
          success: false,
          error:
            "O arquivo foi lido, mas nenhuma conta foi reconhecida. Confira se este é o relatório 'Movimentação por Conta Financeira' (Rel. CRD) do Desbravador — o layout parece diferente do esperado.",
        });
      }

      // Totais a partir dos grupos de nível 1 (evita dupla contagem da hierarquia).
      const nivel1 = accounts.filter((a) => a.nivel === 1);
      res.json({
        success: true,
        report_name: req.file.originalname || "rel-crd.xls",
        summary: {
          contas: accounts.length,
          grupos: nivel1.length,
          total_lancamentos: nivel1.reduce((s, a) => s + a.lancamentos, 0),
          total_baixas: nivel1.reduce((s, a) => s + a.baixas, 0),
          total_lanc_liquido: nivel1.reduce((s, a) => s + a.lanc_liquido, 0),
        },
        accounts,
      });
    } catch (error: any) {
      console.error("Erro ao processar Rel. CRD:", error);
      res.status(500).json({
        success: false,
        error: "Falha ao processar o Rel. CRD.",
        detail: error?.message ? String(error.message).slice(0, 300) : undefined,
      });
    } finally {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    }
  });

  // ====================================================
  // IMPORTAÇÃO: REL. CRD — COMMIT
  // Grava a coluna "SALDO LANÇ." (saldo_lanc) em crd_realizado por conta,
  // aparecendo na coluna REAL. do Prev x Real MENSAL do mês importado.
  // ====================================================
  app.post("/api/import/rel-crd/commit", async (req, res) => {
    const { rows, month, year } = req.body as {
      rows: { codigo: string; saldo_lanc?: number; lanc_liquido?: number }[];
      month: number;
      year: number;
    };
    if (!Array.isArray(rows) || !rows.length)
      return res.status(400).json({ error: "Nenhuma linha enviada." });
    if (!month || !year || month < 1 || month > 12 || year < 2000)
      return res.status(400).json({ error: "Mês/ano inválido." });

    // Busca todos os CRDs ativos para fazer o match por código
    const { data: crds, error: crdErr } = await supabase.from("crds").select("id, code");
    if (crdErr) return res.status(500).json({ error: crdErr.message });

    const codeToId = new Map<string, number>();
    for (const c of crds ?? []) {
      if (c.code) codeToId.set(String(c.code).trim().toLowerCase(), Number(c.id));
    }

    const upserts: { crd_id: number; year: number; month: number; source: string; value: number }[] = [];
    const notFound: string[] = [];
    for (const row of rows) {
      const crdId = codeToId.get(String(row.codigo ?? "").trim().toLowerCase());
      if (!crdId) { notFound.push(row.codigo); continue; }
      const value = Number(row.saldo_lanc ?? row.lanc_liquido ?? 0);
      upserts.push({ crd_id: crdId, year: Number(year), month: Number(month), source: "rel_crd", value });
    }

    if (!upserts.length) {
      return res.status(422).json({
        error: `Nenhum código encontrado no cadastro de CRDs. Verifique se os códigos do relatório existem no sistema.`,
        not_found: notFound,
      });
    }

    const { error: upsertErr } = await supabase
      .from("crd_realizado")
      .upsert(upserts, { onConflict: "crd_id,year,month,source" });
    if (upsertErr) return res.status(500).json({ error: upsertErr.message });

    res.json({
      success: true,
      imported: upserts.length,
      not_found: notFound,
    });
  });

  // ====================================================
  // IMPORTAÇÃO: PROVISÃO DE FÉRIAS (PDF do Desbravador)
  // Extrai todas as linhas (uma por funcionário) e os totais do relatório.
  // Ainda não envia para nenhum destino — só exibe no resumo de importação.
  // ====================================================
  const parsePtBrNumber = (s: string): number => {
    const n = Number(String(s ?? "").trim().replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  // Lê o PDF usando as coordenadas (x,y) de cada trecho de texto (via pdfjs)
  // em vez do texto corrido do pdf-parse. O texto corrido cola números
  // adjacentes sem separador (ex.: código do funcionário colado ao valor
  // seguinte), o que é ambíguo de desfazer só com regex — duas colunas podem
  // formar números diferentes mas igualmente válidos a partir do mesmo texto.
  // Com a posição de cada item já sabemos onde cada coluna começa, então não
  // há ambiguidade: agrupamos por linha (mesmo y), ordenamos por x, e quando
  // o pdfjs funde duas colunas próximas em um único item (ex.: "Valor do Mês"
  // colado ao "INSS" com espaços), separamos por "2+ espaços".
  const extractPdfRowsByPosition = async (fileBuffer: Buffer): Promise<string[][]> => {
    const PDFJS = await loadPdfJs();
    const doc = await PDFJS.getDocument({ data: fileBuffer }).promise;
    const rows: string[][] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const byY = new Map<number, { x: number; str: string }[]>();
      for (const item of content.items as any[]) {
        const y = Math.round(item.transform[5]);
        if (!byY.has(y)) byY.set(y, []);
        byY.get(y)!.push({ x: item.transform[4], str: item.str });
      }
      for (const items of byY.values()) {
        items.sort((a, b) => a.x - b.x);
        const tokens: string[] = [];
        for (const it of items) {
          for (const part of it.str.split(/\s{2,}/)) {
            const t = part.trim();
            if (t !== "") tokens.push(t);
          }
        }
        if (tokens.length) rows.push(tokens);
      }
    }
    return rows;
  };

  const parseProvisaoFeriasPdf = async (fileBuffer: Buffer, headerText: string) => {
    const periodMatch = /M[ÊE]S:\s*(\d{1,2})\/(\d{4})/i.exec(headerText);
    const month = periodMatch ? Number(periodMatch[1]) : undefined;
    const year = periodMatch ? Number(periodMatch[2]) : undefined;

    const tableRows = await extractPdfRowsByPosition(fileBuffer);
    // Linha de funcionário: 14 colunas e o 1º token é o código (só dígitos).
    // Ordem visual: Código, Nome, Vencto.férias, FérVen, FérPro, Faltas,
    // Salário, Média e vantagens, 1/3 férias, Valor devido, Valor do mês,
    // INSS, FGTS, PIS.
    const rows = tableRows
      .filter((tokens) => tokens.length === 14 && /^\d{1,5}$/.test(tokens[0]))
      .map((tokens) => {
        const [codigo, nome, vencto, ferVen, ferPro, faltas, salario, media, terco, valorDevido, valorMes, inss, fgts, pis] =
          tokens;
        return {
          codigo,
          nome,
          vencto_ferias: vencto,
          fer_ven: Number(ferVen) || 0,
          fer_pro: parsePtBrNumber(ferPro),
          faltas: Number(faltas) || 0,
          salario: parsePtBrNumber(salario),
          media_vantagens: parsePtBrNumber(media),
          terco_ferias: parsePtBrNumber(terco),
          valor_devido: parsePtBrNumber(valorDevido),
          valor_mes: parsePtBrNumber(valorMes),
          inss: parsePtBrNumber(inss),
          fgts: parsePtBrNumber(fgts),
          pis: parsePtBrNumber(pis),
        };
      });

    const totals = rows.reduce(
      (acc, r) => {
        acc.salario += r.salario;
        acc.media_vantagens += r.media_vantagens;
        acc.terco_ferias += r.terco_ferias;
        acc.valor_devido += r.valor_devido;
        acc.valor_mes += r.valor_mes;
        acc.inss += r.inss;
        acc.fgts += r.fgts;
        acc.pis += r.pis;
        return acc;
      },
      { salario: 0, media_vantagens: 0, terco_ferias: 0, valor_devido: 0, valor_mes: 0, inss: 0, fgts: 0, pis: 0 }
    );

    return { month, year, rows, totals: rows.length ? totals : null };
  };

  app.post("/api/import/provisao-ferias/preview", upload.single("provisao_ferias_pdf"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Arquivo não enviado" });
    if (req.file.mimetype !== "application/pdf" && !/\.pdf$/i.test(req.file.originalname || "")) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Envie o relatório em PDF." });
    }
    try {
      const fileBuffer = fs.readFileSync(req.file.path);
      const pdfParse = await loadPdfParse();
      const parsed = await pdfParse(fileBuffer);
      const result = await parseProvisaoFeriasPdf(fileBuffer, parsed.text || "");

      if (!result.totals || !result.rows.length) {
        return res.status(422).json({
          success: false,
          error:
            "O arquivo foi lido, mas nenhum funcionário foi reconhecido. Confira se este é o relatório 'Provisão de Férias' do Desbravador — o layout parece diferente do esperado.",
        });
      }

      res.json({
        success: true,
        report_name: req.file.originalname || "provisao-ferias.pdf",
        period: { month: result.month, year: result.year },
        totals: result.totals,
        rows: result.rows,
      });
    } catch (error: any) {
      console.error("Erro ao processar Provisão de Férias:", error);
      res.status(500).json({
        success: false,
        error: "Falha ao processar o relatório de Provisão de Férias.",
        detail: error?.message ? String(error.message).slice(0, 300) : undefined,
      });
    } finally {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    }
  });

  // ====================================================
  // IMPORTAÇÃO: PROVISÃO DE 13º SALÁRIO (PDF do Desbravador)
  // Extrai todas as linhas (uma por funcionário) e os totais do relatório.
  // Ainda não envia para nenhum destino — só exibe no resumo de importação.
  // ====================================================
  // Linhas de cabeçalho/rodapé que não fazem parte da tabela de funcionários.
  const PROVISAO_NOISE_LINE_RE = [
    /^Horas:$/i,
    /^Emissao:$/i,
    /^Pagina:$/i,
    /^CNPJ:$/i,
    /^Empresa:$/i,
    /^\d{2}:\d{2}:\d{2}$/,
    /^\d{1,2}\/\d{1,2}$/,
    /^\d{2}\/\d{2}\/\d{4}$/,
    /^PROVIS[ÃA]O DE/i,
    /^\d+\s*-\s*VIVAZ/i,
    /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/,
    /^Sistema licenciado/i,
    /^\s*$/,
    /^Encargos.*Nome do empregado/i,
    /^PIS.*M[êe]s$/i,
    /^C[óo]digo Nome do empregado/i,
    /^Total\s+Geral/i,
  ];

  // Junta as linhas "úteis" do relatório (sem cabeçalho/rodapé/paginação) em uma
  // única string, pois o pdf-parse extrai o texto na ordem das colunas da
  // tabela (não a ordem visual) e cada registro de funcionário fica espalhado
  // por 2-3 linhas dependendo da quebra de página/nome.
  const joinProvisaoTableLines = (text: string, totalIdx: number): string => {
    const lines = (totalIdx >= 0 ? text.slice(0, totalIdx) : text).split("\n");
    return lines.filter((l) => !PROVISAO_NOISE_LINE_RE.some((re) => re.test(l.trim()))).join("");
  };

  const moneyToken = "(-?\\d{1,3}(?:\\.\\d{3})*,\\d{2})";

  const parseProvisao13PdfText = (text: string) => {
    const periodMatch = /M[ÊE]S:\s*(\d{1,2})\/(\d{4})/i.exec(text);
    const month = periodMatch ? Number(periodMatch[1]) : undefined;
    const year = periodMatch ? Number(periodMatch[2]) : undefined;

    const totalIdx = text.search(/Total\s+Geral/i);
    if (totalIdx < 0) return { month, year, rows: [] as any[], totals: null as null };

    const joined = joinProvisaoTableLines(text, totalIdx);
    // Cada registro: INSS, FGTS, Valor do Mês, Código, PIS, Nome, Data admissão,
    // Média e vantagens, Salário 13º, Avos (NN/12), Adiantamento 13º, Valor devido.
    const recordRe = new RegExp(
      moneyToken + moneyToken + moneyToken + "(\\d{1,4})" + moneyToken +
        "([^\\d]+?)(\\d{2}/\\d{2}/\\d{4})" + moneyToken + moneyToken + "(\\d{2}/12)" + moneyToken + moneyToken,
      "g"
    );

    const rows: any[] = [];
    let m: RegExpExecArray | null;
    while ((m = recordRe.exec(joined))) {
      rows.push({
        codigo: m[4],
        nome: m[6].trim(),
        data_admissao: m[7],
        avos: m[10],
        salario_13: parsePtBrNumber(m[9]),
        media_vantagens: parsePtBrNumber(m[8]),
        adiantamento_13: parsePtBrNumber(m[11]),
        valor_devido: parsePtBrNumber(m[12]),
        valor_mes: parsePtBrNumber(m[3]),
        inss: parsePtBrNumber(m[1]),
        fgts: parsePtBrNumber(m[2]),
        pis: parsePtBrNumber(m[5]),
      });
    }

    // Totais a partir do "Total Geral" do relatório (mesma ordem de colunas
    // jumbled do pdf-parse: INSS/FGTS/PIS/ValorMês antes do marcador, e
    // Média/Adiantamento/ValorDevido/Salário13 depois).
    const moneyRe = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g;
    const before = text.slice(Math.max(0, totalIdx - 100), totalIdx).match(moneyRe) || [];
    const after = text.slice(totalIdx, totalIdx + 200).match(moneyRe) || [];
    const [inssS, fgtsS, pisS, valorMesS] = before.slice(-4);
    const [mediaVantagensS, adiantamentoS, valorDevidoS, salario13S] = after.slice(0, 4);
    const totals = salario13S && valorDevidoS
      ? {
          salario_13: parsePtBrNumber(salario13S),
          media_vantagens: parsePtBrNumber(mediaVantagensS),
          adiantamento_13: parsePtBrNumber(adiantamentoS),
          valor_devido: parsePtBrNumber(valorDevidoS),
          valor_mes: parsePtBrNumber(valorMesS),
          inss: parsePtBrNumber(inssS),
          fgts: parsePtBrNumber(fgtsS),
          pis: parsePtBrNumber(pisS),
        }
      : null;

    return { month, year, rows, totals };
  };

  app.post("/api/import/provisao-13/preview", upload.single("provisao_13_pdf"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Arquivo não enviado" });
    if (req.file.mimetype !== "application/pdf" && !/\.pdf$/i.test(req.file.originalname || "")) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Envie o relatório em PDF." });
    }
    try {
      const fileBuffer = fs.readFileSync(req.file.path);
      const pdfParse = await loadPdfParse();
      const parsed = await pdfParse(fileBuffer);
      const result = parseProvisao13PdfText(parsed.text || "");

      if (!result.totals || !result.rows.length) {
        return res.status(422).json({
          success: false,
          error:
            "O arquivo foi lido, mas nenhum funcionário foi reconhecido. Confira se este é o relatório 'Provisão de 13º Salário' do Desbravador — o layout parece diferente do esperado.",
        });
      }

      res.json({
        success: true,
        report_name: req.file.originalname || "provisao-13.pdf",
        period: { month: result.month, year: result.year },
        totals: result.totals,
        rows: result.rows,
      });
    } catch (error: any) {
      console.error("Erro ao processar Provisão de 13º Salário:", error);
      res.status(500).json({
        success: false,
        error: "Falha ao processar o relatório de Provisão de 13º Salário.",
        detail: error?.message ? String(error.message).slice(0, 300) : undefined,
      });
    } finally {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    }
  });

  // ====================================================
  // IMPORTAÇÃO: RELATÓRIO DIÁRIO DE SITUAÇÃO — RDS (.xls do Desbravador)
  // Layout em 2 blocos de colunas lado a lado (Hospedagem/Eventos/Estatísticas
  // à esquerda; Alim.&Bebidas/Diversos/Fechamentos/Recebimentos/Adiantamentos/
  // Resumo/Previsão da semana à direita), cada bloco lido como um fluxo
  // independente de seções (o título de uma seção nem sempre fica na mesma
  // coluna — ex.: "Estatísticas" aparece deslocado por causa de células
  // mescladas no Excel original). Extrai tudo; ainda não envia para nenhum
  // destino — só exibe no resumo de importação.
  // ====================================================
  const RDS_LEFT_RANGE = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const RDS_RIGHT_RANGE = [9, 10, 11, 12, 13, 14, 15, 16, 17];
  const RDS_LEFT_SECTIONS = ["Hospedagem", "Eventos", "Estatísticas"];
  const RDS_RIGHT_SECTIONS = [
    "Alim. & Bebidas",
    "Diversos",
    "Fechamentos",
    "Recebimentos",
    "Adiantamentos",
    "Resumo",
    "Previsão de ocupação da semana",
  ];
  const RDS_HEADER_TOKENS = new Set(["Diário", "Acumulado", "%", "Pagamento", "Operação", "Valores", "Indicador"]);

  const parseRdsFlexibleNumber = (v: any): number => {
    if (typeof v === "number") return v;
    const s = String(v ?? "").trim();
    if (!s || s === "-") return 0;
    const n = Number(s.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };
  const rdsIsNumericLike = (v: any): boolean => {
    if (typeof v === "number") return true;
    const s = String(v ?? "").trim();
    return s === "-" || /^-?[\d.,]+$/.test(s);
  };

  type RdsItem = { label: string; values: number[] };
  type RdsSection = { items: RdsItem[]; total: number[] | null };

  const scanRdsBlock = (
    rows: any[][],
    colRange: number[],
    knownSections: string[],
    skipRows: Set<number>
  ): { sections: Record<string, RdsSection>; order: string[] } => {
    const sections: Record<string, RdsSection> = {};
    const order: string[] = [];
    let currentSection: string | null = null;

    for (let i = 0; i < rows.length; i++) {
      if (skipRows.has(i)) continue;
      const row = rows[i] || [];
      const cells = colRange.map((c) => row[c]).filter((c) => c !== "" && c !== undefined && c !== null);
      if (!cells.length) continue;

      const sectionMatch = cells.find((c) => typeof c === "string" && knownSections.includes(c.trim()));
      if (sectionMatch) {
        currentSection = String(sectionMatch).trim();
        if (!sections[currentSection]) {
          sections[currentSection] = { items: [], total: null };
          order.push(currentSection);
        }
        continue;
      }
      if (!currentSection) continue;

      let label: string | null = null;
      const values: any[] = [];
      let skipRow = false;
      for (const c of cells) {
        if (label === null) {
          if (typeof c === "string" && RDS_HEADER_TOKENS.has(c.trim())) {
            skipRow = true;
            break;
          }
          if (!rdsIsNumericLike(c)) {
            label = String(c).trim();
            continue;
          }
          continue;
        }
        values.push(c);
      }
      if (skipRow || label === null || !values.length) continue;

      if (label === "Total") {
        sections[currentSection].total = values.map(parseRdsFlexibleNumber);
      } else {
        sections[currentSection].items.push({ label, values: values.map(parseRdsFlexibleNumber) });
      }
    }
    return { sections, order };
  };

  const RDS_SECTION_META: Record<string, { key: string; title: string; columns: string[] }> = {
    "Hospedagem": { key: "hospedagem", title: "Hospedagem", columns: ["Item", "Diário (R$)", "Diário %", "Acumulado (R$)", "Acumulado %"] },
    "Eventos": { key: "eventos", title: "Eventos", columns: ["Item", "Diário (R$)", "Diário %", "Acumulado (R$)", "Acumulado %"] },
    "Estatísticas": { key: "estatisticas", title: "Estatísticas", columns: ["Indicador", "Diário", "Diário %", "Acumulado", "Acumulado %"] },
    "Alim. & Bebidas": { key: "alimentos_bebidas", title: "Alimentos & Bebidas", columns: ["Item", "Diário (R$)", "Diário %", "Acumulado (R$)", "Acumulado %"] },
    "Diversos": { key: "diversos", title: "Diversos", columns: ["Item", "Diário (R$)", "Diário %", "Acumulado (R$)", "Acumulado %"] },
    "Fechamentos": { key: "fechamentos", title: "Fechamentos (Pagamento)", columns: ["Forma", "Diário (R$)", "Acumulado (R$)"] },
    "Recebimentos": { key: "recebimentos", title: "Recebimentos (Pagamento)", columns: ["Forma", "Diário (R$)", "Acumulado (R$)"] },
    "Adiantamentos": { key: "adiantamentos", title: "Adiantamentos (Operação)", columns: ["Operação", "Diário (R$)", "Acumulado (R$)"] },
    "Resumo": { key: "resumo", title: "Resumo de Valores", columns: ["Indicador", "Diário (R$)", "Acumulado (R$)"] },
  };

  const parseRdsFile = (filePath: string) => {
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true }) as any[][];

    const dateRow = rows.find((r) => r.some((c) => typeof c === "string" && /^Data:\s*\d{2}\/\d{2}\/\d{4}$/.test(c.trim())));
    const dateCell = dateRow?.find((c) => typeof c === "string" && /^Data:/.test(c.trim()));
    const dateMatch = dateCell ? /(\d{2})\/(\d{2})\/(\d{4})/.exec(dateCell) : null;
    const date = dateMatch ? `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}` : null;
    const month = dateMatch ? Number(dateMatch[2]) : undefined;
    const year = dateMatch ? Number(dateMatch[3]) : undefined;

    // A mini-tabela semanal não tem rótulo nas linhas de dia/data, então é
    // extraída à parte (não cabe no scanner genérico linha a linha).
    let weekRowIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];
      if (RDS_RIGHT_RANGE.some((c) => String(row[c] ?? "").trim() === "Previsão de ocupação da semana")) {
        weekRowIdx = i;
        break;
      }
    }
    const skipRows = new Set<number>();
    let previsaoSemana: { dia: string; data: string; quantidade: number; percentual: number }[] = [];
    if (weekRowIdx >= 0) {
      const diasRow = rows[weekRowIdx + 1] || [];
      const datasRow = rows[weekRowIdx + 2] || [];
      const qtdRow = rows[weekRowIdx + 3] || [];
      const pctRow = rows[weekRowIdx + 4] || [];
      const dias = RDS_RIGHT_RANGE.map((c) => diasRow[c]).filter((v) => v !== "" && v != null);
      const datas = RDS_RIGHT_RANGE.map((c) => datasRow[c]).filter((v) => v !== "" && v != null);
      const qtdValues = RDS_RIGHT_RANGE.map((c) => qtdRow[c]).filter((v) => v !== "" && v != null).slice(1).map(parseRdsFlexibleNumber);
      const pctValues = RDS_RIGHT_RANGE.map((c) => pctRow[c]).filter((v) => v !== "" && v != null).slice(1).map(parseRdsFlexibleNumber);
      previsaoSemana = (dias as string[]).map((dia, idx) => ({
        dia,
        data: String(datas[idx] ?? ""),
        quantidade: qtdValues[idx] ?? 0,
        percentual: pctValues[idx] ?? 0,
      }));
      for (let r = weekRowIdx; r <= weekRowIdx + 4; r++) skipRows.add(r);
    }

    const left = scanRdsBlock(rows, RDS_LEFT_RANGE, RDS_LEFT_SECTIONS, skipRows);
    const right = scanRdsBlock(rows, RDS_RIGHT_RANGE, RDS_RIGHT_SECTIONS, skipRows);

    const sections = [...left.order, ...right.order].map((name) => {
      const meta = RDS_SECTION_META[name] ?? { key: name, title: name, columns: [] };
      const data = left.sections[name] ?? right.sections[name];
      return { ...meta, items: data.items, total: data.total };
    });

    return { date, month, year, sections, previsao_semana: previsaoSemana };
  };

  app.post("/api/import/rds/preview", upload.single("rds_file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Arquivo não enviado" });
    if (!/\.(xls|xlsx)$/i.test(req.file.originalname || "")) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Envie o relatório em Excel (.xls ou .xlsx)." });
    }
    try {
      const result = parseRdsFile(req.file.path);
      if (!result.sections.length) {
        return res.status(422).json({
          success: false,
          error:
            "O arquivo foi lido, mas nenhuma seção foi reconhecida. Confira se este é o Relatório Diário de Situação (RDS) do Desbravador — o layout parece diferente do esperado.",
        });
      }
      res.json({
        success: true,
        report_name: req.file.originalname || "rds.xls",
        date: result.date,
        period: { month: result.month, year: result.year },
        sections: result.sections,
        previsao_semana: result.previsao_semana,
      });
    } catch (error: any) {
      console.error("Erro ao processar RDS:", error);
      res.status(500).json({
        success: false,
        error: "Falha ao processar o Relatório Diário de Situação.",
        detail: error?.message ? String(error.message).slice(0, 300) : undefined,
      });
    } finally {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    }
  });

  // ====================================================
  // IMPORTAÇÃO: REQUISIÇÕES SINTÉTICA POR GRUPO DE ITENS (.xls do Desbravador)
  // Hierarquia Setor > Grupo de itens > valor requisitado no período.
  // Cada setor é uma linha com só código+nome (sem valor); os grupos abaixo
  // têm código+nome+valor; e fecha com uma linha "Total Setor :". O arquivo
  // repete o cabeçalho (título + filtros) a cada página impressa, então essas
  // linhas são ignoradas. Ainda não envia para nenhum destino — só exibe no
  // resumo de importação.
  // ====================================================
  const excelDateToIso = (serial: any): string | null => {
    if (typeof serial !== "number" || !Number.isFinite(serial)) return null;
    const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  };

  type RequisicaoGrupo = { codigo: number; nome: string; valor: number };
  type RequisicaoSetor = { codigo: number; nome: string; grupos: RequisicaoGrupo[]; total: number | null };

  const parseRequisicoesSinteticaFile = (filePath: string) => {
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true }) as any[][];

    const filtroRow = rows.find((r) => String(r[0] ?? "").trim().startsWith("Filtros"));
    const periodo = filtroRow
      ? { de: excelDateToIso(filtroRow[2]), ate: excelDateToIso(filtroRow[4]) }
      : { de: null, ate: null };

    const setores: RequisicaoSetor[] = [];
    let currentSetor: RequisicaoSetor | null = null;
    let totalGeral: number | null = null;

    for (const row of rows) {
      const c0 = row[0];
      const c1 = String(row[1] ?? "").trim();
      const c8 = String(row[8] ?? "").trim();
      const c11 = row[11];

      if (typeof c0 === "string" && (c0.startsWith("VIVAZ") || c0.startsWith("Filtros"))) continue;
      if (c8 === "Total Setor :") {
        if (currentSetor) currentSetor.total = Number(c11) || 0;
        continue;
      }
      if (c8 === "Total Geral :") {
        totalGeral = Number(c11) || 0;
        continue;
      }
      // Linha de setor: código numérico + nome, sem valor na coluna do grupo.
      if (typeof c0 === "number" && c1 && (c11 === "" || c11 == null)) {
        currentSetor = { codigo: c0, nome: c1, grupos: [], total: null };
        setores.push(currentSetor);
        continue;
      }
      // Linha de grupo: código numérico + nome + valor, dentro do setor atual.
      if (typeof c0 === "number" && c1 && typeof c11 === "number" && currentSetor) {
        currentSetor.grupos.push({ codigo: c0, nome: c1, valor: c11 });
        continue;
      }
    }

    return { periodo, setores, totalGeral };
  };

  app.post("/api/import/requisicoes-sintetica/preview", upload.single("requisicoes_file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Arquivo não enviado" });
    if (!/\.(xls|xlsx)$/i.test(req.file.originalname || "")) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Envie o relatório em Excel (.xls ou .xlsx)." });
    }
    try {
      const result = parseRequisicoesSinteticaFile(req.file.path);
      if (!result.setores.length) {
        return res.status(422).json({
          success: false,
          error:
            "O arquivo foi lido, mas nenhum setor foi reconhecido. Confira se este é o relatório 'Requisições Sintética por Grupo de Itens' do Desbravador — o layout parece diferente do esperado.",
        });
      }
      res.json({
        success: true,
        report_name: req.file.originalname || "requisicoes-sintetica.xls",
        periodo: result.periodo,
        setores: result.setores,
        total_geral: result.totalGeral,
      });
    } catch (error: any) {
      console.error("Erro ao processar Requisições Sintética:", error);
      res.status(500).json({
        success: false,
        error: "Falha ao processar o relatório de Requisições Sintética por Grupo de Itens.",
        detail: error?.message ? String(error.message).slice(0, 300) : undefined,
      });
    } finally {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    }
  });

  // ====================================================
  // IMPORTAÇÃO: EXTRATO MENSAL (folha de pagamento, .xls BIFF do Desbravador)
  // Estes .xls quebram o leitor do SheetJS (formato de número inválido + substream
  // que ele não emite), então fazemos um walker BIFF8 próprio resolvendo o SST.
  // Por enquanto apenas extrai e devolve por funcionário (não persiste).
  // ====================================================
  const decodeRK = (rk: number): number => {
    const mult = (rk & 1) ? 0.01 : 1;
    let n: number;
    if (rk & 2) {
      n = (rk | 0) >> 2;
    } else {
      const b = Buffer.alloc(8);
      b.writeUInt32LE((rk & 0xfffffffc) >>> 0, 4);
      n = b.readDoubleLE(0);
    }
    return n * mult;
  };

  // Lê um .xls do Desbravador em uma grade [linha][coluna], contornando o SheetJS.
  const readDesbravadorXlsGrid = (filePath: string): any[][] => {
    const buf = fs.readFileSync(filePath);
    const wb = xlsx.read(buf, { type: "buffer", bookSST: true } as any);
    const sst: string[] = (((wb as any).Strings) || []).map((s: any) =>
      typeof s === "string" ? s : (s && s.t) || ""
    );
    const cfb: any = (xlsx as any).CFB.read(buf, { type: "buffer" });
    const wbIdx = cfb.FullPaths.indexOf("Root Entry/Workbook");
    if (wbIdx < 0) return [];
    const data: Buffer = Buffer.from(cfb.FileIndex[wbIdx].content);
    const grid: any[][] = [];
    const put = (r: number, c: number, v: any) => {
      if (!grid[r]) grid[r] = [];
      grid[r][c] = v;
    };
    let l = 0;
    while (l < data.length - 4) {
      const type = data.readUInt16LE(l);
      const len = data.readUInt16LE(l + 2);
      const p = l + 4;
      l = p + len;
      if (p + len > data.length) break;
      if (type === 0x00fd) {
        put(data.readUInt16LE(p), data.readUInt16LE(p + 2), sst[data.readUInt32LE(p + 6)] ?? "");
      } else if (type === 0x0203) {
        put(data.readUInt16LE(p), data.readUInt16LE(p + 2), data.readDoubleLE(p + 6));
      } else if (type === 0x027e) {
        put(data.readUInt16LE(p), data.readUInt16LE(p + 2), decodeRK(data.readInt32LE(p + 6)));
      } else if (type === 0x00bd) {
        const r = data.readUInt16LE(p);
        const cf = data.readUInt16LE(p + 2);
        const n = (len - 6) / 6;
        for (let i = 0; i < n; i++) put(r, cf + i, decodeRK(data.readInt32LE(p + 4 + i * 6 + 2)));
      }
    }
    return grid;
  };

  // Extrai a folha por funcionário a partir da grade do Extrato Mensal.
  const parseExtratoEmployees = (grid: any[][]): any[] => {
    const num = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const cellsOf = (row: any[]) =>
      (row || [])
        .map((v, c) => ({ c, v }))
        .filter((e) => e.v !== undefined && e.v !== null && String(e.v).trim() !== "");
    const after = (cells: { c: number; v: any }[], label: string) => {
      const i = cells.findIndex((e) => String(e.v).trim().toLowerCase().startsWith(label.toLowerCase()));
      return i >= 0 && cells[i + 1] ? cells[i + 1].v : undefined;
    };

    const employees: any[] = [];
    let cur: any = null;
    for (const row of grid) {
      const cells = cellsOf(row);
      if (!cells.length) continue;
      const first = String(cells[0].v).trim();
      if (first.startsWith("Empr.:")) {
        if (cur) employees.push(cur);
        cur = {
          matricula: after(cells, "Empr.:") ?? null,
          nome: cells[2] ? String(cells[2].v).trim() : "",
          situacao: String(after(cells, "Situação:") ?? "").trim(),
          cpf: String(after(cells, "CPF:") ?? "").trim(),
          cargo_cod: null,
          cargo: "",
          salario: 0,
          proventos: 0,
          descontos: 0,
          liquido: 0,
          base_inss: 0,
          base_fgts: 0,
          base_irrf: 0,
        };
        continue;
      }
      if (!cur) continue;
      if (first.startsWith("Cargo:")) {
        cur.cargo_cod = after(cells, "Cargo:") ?? null;
        cur.cargo = cells[2] ? String(cells[2].v).trim() : "";
        cur.salario = num(after(cells, "Salário:"));
      } else if (first.startsWith("ND:")) {
        cur.proventos = num(after(cells, "Proventos:"));
        cur.descontos = num(after(cells, "Descontos:"));
        cur.liquido = num(after(cells, "Líquido:"));
      } else if (first.startsWith("NF:")) {
        cur.base_inss = num(after(cells, "Base INSS:"));
        cur.base_fgts = num(after(cells, "Base FGTS:"));
        cur.base_irrf = num(after(cells, "Base IRRF:"));
      }
    }
    if (cur) employees.push(cur);
    return employees;
  };

  // Extrai a seção "Resumo por Rubrica" do Extrato Mensal (totais por rubrica do mês).
  // Cada linha tem dois lados: esquerda (cols 1/8/19/24/31) e direita (cols 34/38/53/65/73).
  const parseExtratoRubricas = (grid: any[][]): any[] => {
    const toNum = (v: any) => {
      if (typeof v === "number") return Number.isFinite(v) ? v : 0;
      let s = String(v ?? "").trim();
      if (!s) return 0;
      s = s.replace(/\./g, "").replace(",", ".").replace(/[^0-9.\-]/g, "");
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    };
    // Localiza o início do "Resumo por Rubrica".
    let start = -1;
    for (let r = 0; r < grid.length; r++) {
      if ((grid[r] || []).some((c) => String(c).trim() === "Resumo por Rubrica")) {
        start = r;
        break;
      }
    }
    if (start < 0) return [];

    const out: any[] = [];
    const addSide = (row: any[], codeCol: number, nameCol: number, horasCol: number, valCol: number, tipoCol: number) => {
      const codigo = row[codeCol];
      const nome = String(row[nameCol] ?? "").trim();
      const tipo = String(row[tipoCol] ?? "").trim().toUpperCase();
      if ((typeof codigo !== "number" && !String(codigo ?? "").trim()) || !nome) return;
      if (tipo !== "P" && tipo !== "D") return;
      out.push({
        codigo: String(codigo).trim(),
        nome,
        horas: String(row[horasCol] ?? "").trim(),
        valor: toNum(row[valCol]),
        tipo,
        operacao: tipo === "D" ? "subtracao" : "soma", // padrão: P soma, D subtrai
      });
    };
    for (let r = start + 1; r < grid.length; r++) {
      const row = grid[r] || [];
      addSide(row, 1, 8, 19, 24, 31); // lado esquerdo
      addSide(row, 34, 38, 53, 65, 73); // lado direito
    }
    return out;
  };

  // Extrai rubricas linha a linha por funcionário (entre Empr. e ND:/NF:).
  const parseExtratoEmployeeRubricas = (grid: any[][]): any[] => {
    const toNum = (v: any) => {
      if (typeof v === "number") return Number.isFinite(v) ? v : 0;
      let s = String(v ?? "").trim();
      if (!s) return 0;
      s = s.replace(/\./g, "").replace(",", ".").replace(/[^0-9.\-]/g, "");
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    };
    const cellsOf = (row: any[]) =>
      (row || [])
        .map((v, c) => ({ c, v }))
        .filter((e) => e.v !== undefined && e.v !== null && String(e.v).trim() !== "");
    const after = (cells: { c: number; v: any }[], label: string) => {
      const i = cells.findIndex((e) => String(e.v).trim().toLowerCase().startsWith(label.toLowerCase()));
      return i >= 0 && cells[i + 1] ? cells[i + 1].v : undefined;
    };

    const out: any[] = [];
    let emp: any = null;
    for (const row of grid) {
      const cells = cellsOf(row);
      if (!cells.length) continue;
      const first = String(cells[0].v).trim();
      if (first.startsWith("Empr.:")) {
        emp = {
          matricula: String(after(cells, "Empr.:") ?? "").trim(),
          nome: cells[2] ? String(cells[2].v).trim() : "",
          situacao: String(after(cells, "Situação:") ?? "").trim(),
          cpf: String(after(cells, "CPF:") ?? "").trim(),
          cargo: "",
        };
        continue;
      }
      if (!emp) continue;
      if (first.startsWith("Cargo:")) {
        emp.cargo = cells[2] ? String(cells[2].v).trim() : "";
        continue;
      }
      if (first.startsWith("ND:") || first.startsWith("NF:")) continue;

      const codigoRaw = cells[0].v;
      const codigoStr = String(codigoRaw ?? "").trim();
      const isCode = /^\d{1,5}$/.test(codigoStr) || (typeof codigoRaw === "number" && codigoRaw > 0 && codigoRaw < 100000);
      if (!isCode) continue;

      let tipo = "";
      let valor = 0;
      let horas = "";
      let descricao = "";
      for (const cell of cells.slice(1)) {
        const s = String(cell.v).trim();
        const upper = s.toUpperCase();
        if (upper === "P" || upper === "D") tipo = upper;
        else if (typeof cell.v === "number" && Math.abs(cell.v) >= 0.001 && cell.v !== codigoRaw) {
          if (Math.abs(cell.v) >= Math.abs(valor)) valor = toNum(cell.v);
        } else if (s.length > 2 && !/^\d+([.,]\d+)?$/.test(s)) {
          if (!descricao || s.length > descricao.length) descricao = s;
        } else if (/^\d+([.,]\d+)?$/.test(s) && !horas) {
          horas = s;
        }
      }
      if (!tipo || !valor) continue;
      out.push({
        matricula: emp.matricula,
        nome: emp.nome,
        cpf: emp.cpf,
        situacao: emp.situacao,
        cargo: emp.cargo,
        codigo: codigoStr || String(codigoRaw),
        nome_rubrica: descricao,
        horas,
        valor,
        tipo,
      });
    }
    return out;
  };

  // Detecta o mês/ano do Extrato: 1) competência (data serial no cabeçalho); 2) nome do arquivo (MMAAAA).
  const detectExtratoPeriod = (grid: any[][], fileName: string): { month: number; year: number } | null => {
    for (const row of grid) {
      const cells = (row || [])
        .map((v, c) => ({ c, v }))
        .filter((e) => e.v !== undefined && e.v !== null && String(e.v).trim() !== "");
      const i = cells.findIndex((e) => String(e.v).trim().toLowerCase().startsWith("compet"));
      if (i >= 0) {
        for (let k = i + 1; k < cells.length; k++) {
          const n = Number(cells[k].v);
          if (Number.isFinite(n) && n > 20000 && n < 80000) {
            const d = new Date(Math.round((n - 25569) * 86400 * 1000));
            if (!Number.isNaN(d.getTime())) return { month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
          }
        }
      }
    }
    // Fallback: "...042026..." -> mês 04, ano 2026.
    const m = String(fileName || "").match(/(\d{2})[\s._-]?(\d{4})/);
    if (m) {
      const month = Number(m[1]);
      const year = Number(m[2]);
      if (month >= 1 && month <= 12 && year > 2000 && year < 2100) return { month, year };
    }
    return null;
  };

  app.post("/api/import/extrato-mensal/preview", upload.single("extrato_file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Arquivo não enviado" });
    if (!/\.(xls|xlsx)$/i.test(req.file.originalname || "")) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Envie o relatório em Excel (.xls ou .xlsx)." });
    }
    try {
      const grid = readDesbravadorXlsGrid(req.file.path);
      if (!grid.length) {
        return res.status(422).json({
          success: false,
          error: "Não consegui ler o conteúdo do Excel. O arquivo pode estar corrompido ou em um formato não suportado.",
        });
      }
      const employees = parseExtratoEmployees(grid);
      if (!employees.length) {
        return res.status(422).json({
          success: false,
          error:
            "O arquivo foi lido, mas nenhum funcionário foi reconhecido. Confira se este é o relatório 'Extrato Mensal' (folha de pagamento) do Desbravador — o layout parece diferente do esperado.",
        });
      }
      const period = detectExtratoPeriod(grid, req.file.originalname || "");

      const totalProventos = employees.reduce((s, e) => s + e.proventos, 0);
      const totalDescontos = employees.reduce((s, e) => s + e.descontos, 0);
      const totalLiquido = employees.reduce((s, e) => s + e.liquido, 0);

      res.json({
        success: true,
        report_name: req.file.originalname || "extrato-mensal.xls",
        period,
        destino: { secao: "Folha de Pagamento" },
        summary: {
          funcionarios: employees.length,
          total_proventos: totalProventos,
          total_descontos: totalDescontos,
          total_liquido: totalLiquido,
        },
        employees,
      });
    } catch (error: any) {
      console.error("Erro ao processar Extrato Mensal:", error);
      res.status(500).json({
        success: false,
        error: "Falha ao processar o Extrato Mensal.",
        detail: error?.message ? String(error.message).slice(0, 300) : undefined,
      });
    } finally {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    }
  });

  // ====================================================
  // FOLHA DE PAGAMENTO (uma tela por mês; alimentada pelo Extrato Mensal)
  // ====================================================
  app.get("/api/folha", async (req, res) => {
    const year = Number((req.query as any)?.year) || new Date().getFullYear();
    const month = Number((req.query as any)?.month);
    if (!month || month < 1 || month > 12) return res.status(400).json({ error: "month deve estar entre 1 e 12" });

    const { data, error } = await supabase
      .from("folha_pagamento")
      .select("matricula, nome, cargo, situacao, cpf, salario, proventos, descontos, liquido, base_inss, base_fgts, base_irrf")
      .eq("year", year)
      .eq("month", month)
      .order("nome");
    if (error) {
      console.error("Erro ao carregar folha:", error);
      return res.status(500).json({ error: "Erro interno ao processar a solicitação." });
    }

    const employees = data ?? [];
    const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    res.json({
      year,
      month,
      employees,
      summary: {
        funcionarios: employees.length,
        total_proventos: employees.reduce((s, e) => s + n((e as any).proventos), 0),
        total_descontos: employees.reduce((s, e) => s + n((e as any).descontos), 0),
        total_liquido: employees.reduce((s, e) => s + n((e as any).liquido), 0),
      },
    });
  });

  // Importa o Extrato Mensal (.xls) e grava a folha do mês (substitui o que existir).
  app.post("/api/folha/import", requireRole("admin", "finance", "controle"), upload.single("extrato_file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Arquivo não enviado" });
    if (!/\.(xls|xlsx)$/i.test(req.file.originalname || "")) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Envie o relatório em Excel (.xls ou .xlsx)." });
    }
    const year = Number((req.body as any)?.year) || new Date().getFullYear();
    const month = Number((req.body as any)?.month);
    if (!month || month < 1 || month > 12) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Informe o mês (1 a 12) para gravar a folha." });
    }
    try {
      const grid = readDesbravadorXlsGrid(req.file.path);
      if (!grid.length) {
        return res.status(422).json({
          error: "Não consegui ler o conteúdo do Excel. O arquivo pode estar corrompido ou em formato não suportado.",
        });
      }
      const employees = parseExtratoEmployees(grid);
      if (!employees.length) {
        return res.status(422).json({
          error:
            "Nenhum funcionário foi reconhecido no arquivo. Confira se este é o relatório 'Extrato Mensal' do Desbravador.",
        });
      }

      const rows = employees.map((e) => ({
        year,
        month,
        matricula: String(e.matricula ?? "").trim() || "SEM-MATRICULA",
        nome: String(e.nome ?? "").trim(),
        cargo: String(e.cargo ?? "").trim(),
        situacao: String(e.situacao ?? "").trim(),
        cpf: String(e.cpf ?? "").trim(),
        salario: e.salario || 0,
        proventos: e.proventos || 0,
        descontos: e.descontos || 0,
        liquido: e.liquido || 0,
        base_inss: e.base_inss || 0,
        base_fgts: e.base_fgts || 0,
        base_irrf: e.base_irrf || 0,
      }));

      // Substitui a folha do mês.
      await supabase.from("folha_pagamento").delete().eq("year", year).eq("month", month);
      const { error } = await supabase.from("folha_pagamento").insert(rows);
      if (error) {
        console.error("Erro ao gravar folha:", error);
        await logImportHistory({
          source_type: "extrato_mensal",
          file_name: req.file.originalname,
          status: "error",
          year,
          month,
          user: req.user,
          error_message: String(error.message || "Não foi possível gravar a folha do mês no banco.").slice(0, 500),
        });
        return res.status(500).json({
          error: "Não foi possível gravar a folha do mês no banco.",
          detail: error.message ? String(error.message).slice(0, 300) : undefined,
        });
      }

      // Grava o "Resumo por Rubrica" do mês (substitui o que existir).
      const rubricasParsed = parseExtratoRubricas(grid);
      if (rubricasParsed.length) {
        await supabase.from("folha_rubricas").delete().eq("year", year).eq("month", month);
        const seen = new Set<string>();
        const rubricaRows = rubricasParsed
          .filter((rb) => {
            const k = `${rb.codigo}|${rb.tipo}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          })
          .map((rb) => ({
            year,
            month,
            codigo: rb.codigo,
            nome: rb.nome,
            horas: rb.horas,
            valor: rb.valor,
            tipo: rb.tipo,
            operacao: rb.operacao,
          }));
        const { error: rubErr } = await supabase.from("folha_rubricas").insert(rubricaRows);
        if (rubErr) console.error("Erro ao gravar rubricas da folha:", rubErr);
      }

      // Parser de detalhe (reutilizado no cadastro e no v2)
      const detalheRubricas = parseExtratoEmployeeRubricas(grid);

      // Mapeamento importação → cadastro de parâmetros (folha_rubricas_parametros)
      let rubricasCadastradasNaImportacao = 0;
      try {
        const { data: paramsExistentes } = await supabase.from("folha_rubricas_parametros").select("codigo_rubrica");
        const codigosCadastrados = new Set(
          (paramsExistentes ?? []).map((p: any) => String(p.codigo_rubrica).trim())
        );
        const rubricasUnicas = rubricasParsed.map((rb) => ({
          codigo: String(rb.codigo).trim(),
          nome: String(rb.nome ?? "").trim(),
          tipo: String(rb.tipo ?? "").trim(),
        }));
        for (const d of detalheRubricas) {
          rubricasUnicas.push({
            codigo: String(d.codigo).trim(),
            nome: String(d.nome_rubrica ?? "").trim(),
            tipo: String(d.tipo ?? "").trim(),
          });
        }
        const novasParametros = listarRubricasNovasParaCadastro(rubricasUnicas, codigosCadastrados);
        if (novasParametros.length) {
          const { error: paramErr } = await supabase.from("folha_rubricas_parametros").insert(
            novasParametros.map((p) => ({ ...p, updated_at: new Date().toISOString() }))
          );
          if (paramErr) console.error("Erro ao cadastrar parâmetros de rubricas na importação:", paramErr);
          else rubricasCadastradasNaImportacao = novasParametros.length;
        }
      } catch (e) {
        console.error("Falha ao mapear rubricas na importação (folha_rubricas_parametros):", e);
      }

      // Metadados da importação para o módulo de apuração (v1 — sempre grava)
      let detalheRubricasCount = detalheRubricas.length;
      const { error: impMetaErr } = await supabase.from("folha_importacoes").upsert(
        {
          nome_arquivo: req.file.originalname,
          competencia_mes: month,
          competencia_ano: year,
          data_importacao: new Date().toISOString(),
          usuario_id: req.user?.id ?? null,
          status: "importado",
          total_funcionarios: rows.length,
          total_rubricas: rubricasParsed.length,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "competencia_ano,competencia_mes" }
      );
      if (impMetaErr) {
        console.error("Erro ao registrar folha_importacoes:", impMetaErr);
      }

      // Complementos v2 (funcionários, lançamentos detalhados, situações)
      try {
        await supabase.from("folha_lancamentos_importados").delete().eq("competencia_ano", year).eq("competencia_mes", month);
        if (detalheRubricas.length) {
          const detRows = detalheRubricas.map((d) => ({
            competencia_ano: year,
            competencia_mes: month,
            codigo_funcionario: d.matricula,
            nome_funcionario: d.nome,
            cpf_funcionario: d.cpf,
            cargo_nome: d.cargo,
            situacao: d.situacao,
            codigo_rubrica: d.codigo,
            descricao_rubrica: d.nome_rubrica,
            tipo_original: d.tipo,
            quantidade: d.horas,
            valor_original: d.valor,
          }));
          await supabase.from("folha_lancamentos_importados").insert(detRows);
        }

        for (const r of rows) {
          const mat = String(r.matricula || "SEM-MATRICULA");
          await supabase.from("folha_funcionarios").upsert(
            {
              codigo_funcionario: mat,
              nome: r.nome,
              cpf: r.cpf,
              cargo_nome: r.cargo,
              situacao_atual: r.situacao,
              salario_base: r.salario,
              ativo: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "codigo_funcionario" }
          );
        }
        const situacoes = new Map<string, number>();
        for (const r of rows) {
          const sit = String(r.situacao || "Outros").trim() || "Outros";
          situacoes.set(sit, (situacoes.get(sit) || 0) + 1);
        }
        await supabase.from("folha_situacoes_resumo").delete().eq("competencia_ano", year).eq("competencia_mes", month);
        const sitRows = Array.from(situacoes.entries()).map(([situacao, quantidade]) => ({
          competencia_ano: year,
          competencia_mes: month,
          situacao,
          quantidade,
        }));
        if (sitRows.length) await supabase.from("folha_situacoes_resumo").insert(sitRows);
      } catch (e) {
        console.error("Falha ao registrar dados de apuração v2 (execute sql/folha_apuracao_module_v2.sql):", e);
      }

      const totalLiquido = rows.reduce((s, r) => s + r.liquido, 0);

      // Lança o líquido total como Realizado na linha "Folha de pagamento" do Setor RH
      // (aparece em Prev x Real > RH > Folha de pagamento > Real do mês).
      let realizadoCrdId: number | null = null;
      try {
        realizadoCrdId = await resolveCrdByNameAndSector("Folha de pagamento", "RH", "RH-FOLHA-PAGAMENTO");
        if (realizadoCrdId) {
          const { error: realErr } = await supabase
            .from("crd_realizado")
            .upsert(
              { crd_id: realizadoCrdId, year, month, source: "folha_pagamento", value: totalLiquido },
              { onConflict: "crd_id,year,month,source" }
            );
          if (realErr) console.error("Erro ao lançar realizado da folha:", realErr);
        }
      } catch (e) {
        console.error("Falha ao lançar realizado da folha no RH:", e);
      }

      await logImportHistory({
        source_type: "extrato_mensal",
        file_name: req.file.originalname,
        status: "success",
        year,
        month,
        records_count: rows.length,
        total_amount: totalLiquido,
        user: req.user,
        summary: {
          funcionarios: rows.length,
          realizado: realizadoCrdId
            ? { setor: "RH", conta: "Folha de pagamento", valor: totalLiquido }
            : null,
        },
      });

      res.json({
        success: true,
        year,
        month,
        funcionarios: rows.length,
        rubricas: rubricasParsed.length,
        rubricas_cadastradas: rubricasCadastradasNaImportacao,
        lancamentos_detalhe: detalheRubricasCount,
        total_liquido: totalLiquido,
        apuracao_pronta: rubricasParsed.length > 0,
        realizado: realizadoCrdId
          ? { setor: "RH", conta: "Folha de pagamento", valor: totalLiquido }
          : null,
      });
    } catch (error: any) {
      console.error("Erro ao importar folha:", error);
      await logImportHistory({
        source_type: "extrato_mensal",
        file_name: req.file?.originalname,
        status: "error",
        year: Number((req.body as any)?.year) || null,
        month: Number((req.body as any)?.month) || null,
        user: req.user,
        error_message: String(error?.message || "Falha ao importar a folha.").slice(0, 500),
      });
      res.status(500).json({
        error: "Falha ao importar a folha.",
        detail: error?.message ? String(error.message).slice(0, 300) : undefined,
      });
    } finally {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    }
  });

  // Calcula o total da folha a partir das rubricas (soma os "soma", subtrai os "subtracao").
  const computeRubricasTotal = (rubricas: any[]) =>
    rubricas.reduce(
      (s, r) => s + (String(r.operacao) === "subtracao" ? -1 : 1) * (Number(r.valor) || 0),
      0
    );

  // Rubricas do mês (Resumo por Rubrica) + total calculado.
  app.get("/api/folha/rubricas", async (req, res) => {
    const year = Number((req.query as any)?.year) || new Date().getFullYear();
    const month = Number((req.query as any)?.month);
    if (!month || month < 1 || month > 12) return res.status(400).json({ error: "month deve estar entre 1 e 12" });
    const { data, error } = await supabase
      .from("folha_rubricas")
      .select("codigo, nome, horas, valor, tipo, operacao")
      .eq("year", year)
      .eq("month", month)
      .order("tipo")
      .order("codigo");
    if (error) {
      console.error("Erro ao carregar rubricas:", error);
      return res.status(500).json({ error: "Erro interno ao processar a solicitação." });
    }
    const rubricas = data ?? [];
    res.json({
      year,
      month,
      rubricas,
      total: computeRubricasTotal(rubricas),
    });
  });

  // Define se uma rubrica soma ou subtrai do total da folha.
  app.patch("/api/folha/rubricas/operacao", requireRole("admin", "finance", "controle"), async (req, res) => {
    const { year, month, codigo, tipo, operacao } = req.body as {
      year?: number; month?: number; codigo?: string; tipo?: string; operacao?: string;
    };
    if (!Number.isFinite(Number(year)) || !Number.isFinite(Number(month))) {
      return res.status(400).json({ error: "year/month inválidos" });
    }
    if (!String(codigo ?? "").trim()) return res.status(400).json({ error: "codigo é obrigatório" });
    if (operacao !== "soma" && operacao !== "subtracao") {
      return res.status(400).json({ error: "operacao deve ser 'soma' ou 'subtracao'" });
    }
    const { error } = await supabase
      .from("folha_rubricas")
      .update({ operacao })
      .eq("year", Number(year))
      .eq("month", Number(month))
      .eq("codigo", String(codigo))
      .eq("tipo", String(tipo ?? "P"));
    if (error) {
      console.error("Erro ao atualizar operação da rubrica:", error);
      return res.status(500).json({ error: "Não foi possível salvar a alteração." });
    }
    res.json({ success: true });
  });

  // Envia o total das rubricas para o PREVISTO e o REALIZADO de RH > Folha de pagamento.
  app.post("/api/folha/rubricas/enviar", requireRole("admin", "finance", "controle"), async (req, res) => {
    const year = Number((req.body as any)?.year);
    const month = Number((req.body as any)?.month);
    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ error: "Informe ano e mês (1 a 12)." });
    }
    const { data: rubricas, error } = await supabase
      .from("folha_rubricas")
      .select("valor, operacao")
      .eq("year", year)
      .eq("month", month);
    if (error) {
      console.error("Erro ao carregar rubricas para envio:", error);
      return res.status(500).json({ error: "Erro ao carregar as rubricas." });
    }
    if (!rubricas?.length) {
      return res.status(422).json({ error: "Nenhuma rubrica importada para este mês. Importe o Extrato primeiro." });
    }
    const total = computeRubricasTotal(rubricas);

    const crdId = await resolveCrdByNameAndSector("Folha de pagamento", "RH", "RH-FOLHA-PAGAMENTO");
    if (!crdId) return res.status(500).json({ error: "Não foi possível resolver a conta RH > Folha de pagamento." });

    // Previsto (crd_monthly_values) e Realizado (crd_realizado) do mês.
    const { error: prevErr } = await supabase
      .from("crd_monthly_values")
      .upsert({ crd_id: crdId, year, month, value: total }, { onConflict: "crd_id,year,month" });
    const { error: realErr } = await supabase
      .from("crd_realizado")
      .upsert({ crd_id: crdId, year, month, source: "folha_pagamento", value: total }, { onConflict: "crd_id,year,month,source" });
    if (prevErr || realErr) {
      console.error("Erro ao gravar previsto/realizado da folha:", prevErr || realErr);
      return res.status(500).json({ error: "Não foi possível gravar no previsto/realizado." });
    }

    res.json({
      success: true,
      total,
      destino: { setor: "RH", conta: "Folha de pagamento" },
      period: { month, year },
    });
  });

  // ====================================================
  // CUSTO DA FOLHA (15 linhas agregadas a partir das rubricas + FGTS manual)
  // ====================================================
  // Classifica uma rubrica em uma das linhas do custo (proposta; revisável).
  const classifyRubrica = (nome: string, tipo: string): string => {
    const norm = String(nome || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const inssKey = norm.replace(/[^a-z0-9]/g, "");
    const has13 = /(^|[^0-9])13([^0-9]|$)|13o|decimo terceiro/.test(norm);
    if (/1\/3/.test(nome)) return "um_terco_ferias";
    if (/inss/.test(inssKey)) {
      if (has13) return "inss_13";
      if (/feria/.test(norm)) return "inss_prov_ferias";
      return "inss";
    }
    if (has13) return "decimo_terceiro";
    if (/feria|abono/.test(norm)) return "ferias";
    if (/comiss/.test(norm)) return "comissao";
    if (/produtiv/.test(norm)) return "produtividade";
    return tipo === "P" ? "proventos" : "retornos";
  };

  app.get("/api/folha/custo", async (req, res) => {
    const year = Number((req.query as any)?.year) || new Date().getFullYear();
    const month = Number((req.query as any)?.month);
    if (!month || month < 1 || month > 12) return res.status(400).json({ error: "month deve estar entre 1 e 12" });

    const { data: rubricas, error } = await supabase
      .from("folha_rubricas")
      .select("codigo, nome, valor, tipo")
      .eq("year", year)
      .eq("month", month);
    if (error) {
      console.error("Erro ao carregar rubricas (custo):", error);
      return res.status(500).json({ error: "Erro interno ao processar a solicitação." });
    }

    const { data: manualRows } = await supabase
      .from("folha_custo_manual")
      .select("fgts, fgts_prov_ferias, fgts_prov_13")
      .eq("year", year)
      .eq("month", month)
      .limit(1);
    const manual = (manualRows && manualRows[0]) || { fgts: 0, fgts_prov_ferias: 0, fgts_prov_13: 0 };

    const groups: Record<string, { valor: number; codigos: any[] }> = {};
    for (const rb of rubricas ?? []) {
      const cat = classifyRubrica((rb as any).nome, (rb as any).tipo);
      if (!groups[cat]) groups[cat] = { valor: 0, codigos: [] };
      const v = Number((rb as any).valor) || 0;
      groups[cat].valor += v;
      groups[cat].codigos.push({ codigo: (rb as any).codigo, nome: (rb as any).nome, valor: v });
    }
    const g = (k: string) => groups[k] || { valor: 0, codigos: [] };

    const proventos = g("proventos").valor;
    const comissao = g("comissao").valor;
    const produtividade = g("produtividade").valor;
    const total_salario = proventos + comissao + produtividade;
    const retornos = g("retornos").valor;
    const decimo = g("decimo_terceiro").valor;
    const ferias = g("ferias").valor;
    const umTerco = g("um_terco_ferias").valor;
    const inss = g("inss").valor;
    const inss13 = g("inss_13").valor;
    const inssProvFerias = g("inss_prov_ferias").valor;
    const fgts = Number(manual.fgts) || 0;
    const fgtsProvFerias = Number(manual.fgts_prov_ferias) || 0;
    const fgtsProv13 = Number(manual.fgts_prov_13) || 0;

    // Custo total: salário + provisões + encargos − retornos (o que volta à empresa).
    const total_custo =
      total_salario + decimo + ferias + umTerco + fgts + fgtsProvFerias + fgtsProv13 + inss + inss13 + inssProvFerias - retornos;

    const linha = (key: string, label: string, valor: number, tipo: string, codigos?: any[]) => ({
      key,
      label,
      valor,
      tipo,
      codigos: codigos || undefined,
    });

    res.json({
      year,
      month,
      manual: { fgts, fgts_prov_ferias: fgtsProvFerias, fgts_prov_13: fgtsProv13 },
      total_custo,
      linhas: [
        linha("proventos", "Proventos", proventos, "rubrica", g("proventos").codigos),
        linha("comissao", "Comissão", comissao, "rubrica", g("comissao").codigos),
        linha("produtividade", "Produtividade", produtividade, "rubrica", g("produtividade").codigos),
        linha("total_salario", "Total Salário", total_salario, "subtotal"),
        linha("retornos", "RETORNOS", retornos, "rubrica_sub", g("retornos").codigos),
        linha("decimo_terceiro", "13º", decimo, "rubrica", g("decimo_terceiro").codigos),
        linha("ferias", "Férias", ferias, "rubrica", g("ferias").codigos),
        linha("um_terco_ferias", "1/3 Férias", umTerco, "rubrica", g("um_terco_ferias").codigos),
        linha("fgts", "FGTS", fgts, "manual"),
        linha("fgts_prov_ferias", "FGTS Prov. Férias", fgtsProvFerias, "manual"),
        linha("fgts_prov_13", "FGTS Prov. 13º", fgtsProv13, "manual"),
        linha("inss", "INSS", inss, "rubrica", g("inss").codigos),
        linha("inss_13", "INSS 13º", inss13, "rubrica", g("inss_13").codigos),
        linha("inss_prov_ferias", "INSS Prov. Férias", inssProvFerias, "rubrica", g("inss_prov_ferias").codigos),
        linha("total_custo", "TOTAL CUSTO", total_custo, "total"),
      ],
    });
  });

  app.patch("/api/folha/custo/manual", requireRole("admin", "finance", "controle"), async (req, res) => {
    const year = Number((req.body as any)?.year);
    const month = Number((req.body as any)?.month);
    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ error: "Informe ano e mês (1 a 12)." });
    }
    const num = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const row: any = { year, month };
    if ((req.body as any)?.fgts !== undefined) row.fgts = num((req.body as any).fgts);
    if ((req.body as any)?.fgts_prov_ferias !== undefined) row.fgts_prov_ferias = num((req.body as any).fgts_prov_ferias);
    if ((req.body as any)?.fgts_prov_13 !== undefined) row.fgts_prov_13 = num((req.body as any).fgts_prov_13);

    const { error } = await supabase.from("folha_custo_manual").upsert(row, { onConflict: "year,month" });
    if (error) {
      console.error("Erro ao salvar FGTS manual:", error);
      return res.status(500).json({ error: "Não foi possível salvar." });
    }
    res.json({ success: true });
  });

  // ====================================================
  // APURAÇÃO DE FOLHA (classificação, cálculo mensal, síntese)
  // ====================================================
  const folhaApuracaoRoles = requireRole("admin", "finance", "controle");

  const loadRubricaParamsMap = async (): Promise<Map<string, RubricaParametro>> => {
    const { data, error } = await supabase
      .from("folha_rubricas_parametros")
      .select("*")
      .eq("ativo", true);
    if (error) throw error;
    const map = new Map<string, RubricaParametro>();
    for (const row of data ?? []) {
      map.set(String((row as any).codigo_rubrica).trim(), row as RubricaParametro);
    }
    return map;
  };

  const loadEncargosAno = async (year: number): Promise<EncargosParametro | null> => {
    const { data, error } = await supabase
      .from("folha_parametros_encargos")
      .select("*")
      .eq("ano", year)
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return data as EncargosParametro;
  };

  const loadFolhaConfig = async (): Promise<FolhaConfig> => {
    const { data } = await supabase.from("folha_config").select("*").eq("id", 1).maybeSingle();
    return {
      comissao_produtividade_separadas: data?.comissao_produtividade_separadas !== false,
      incluir_retorno_total_custo: Boolean(data?.incluir_retorno_total_custo),
    };
  };

  const loadIgnoredRubricas = async (): Promise<Set<string>> => {
    const { data } = await supabase.from("folha_rubricas_ignoradas").select("codigo_rubrica");
    return new Set((data ?? []).map((r: any) => String(r.codigo_rubrica).trim()));
  };

  /** Cria parâmetros de rubricas a partir dos dados já importados (folha_rubricas + detalhe). */
  const sincronizarCadastroRubricasCompetencia = async (year: number, month: number): Promise<number> => {
    const [{ data: rubricas }, { data: paramsExistentes }, { data: detalhe }] = await Promise.all([
      supabase.from("folha_rubricas").select("codigo, nome, tipo").eq("year", year).eq("month", month),
      supabase.from("folha_rubricas_parametros").select("codigo_rubrica"),
      supabase
        .from("folha_lancamentos_importados")
        .select("codigo_rubrica, descricao_rubrica, tipo_original")
        .eq("competencia_ano", year)
        .eq("competencia_mes", month),
    ]);
    const codigosCadastrados = new Set((paramsExistentes ?? []).map((p: any) => String(p.codigo_rubrica).trim()));
    const rubricasUnicas: { codigo: string; nome: string; tipo: string }[] = [];
    for (const rb of rubricas ?? []) {
      rubricasUnicas.push({
        codigo: String((rb as any).codigo).trim(),
        nome: String((rb as any).nome ?? "").trim(),
        tipo: String((rb as any).tipo ?? "").trim(),
      });
    }
    for (const d of detalhe ?? []) {
      rubricasUnicas.push({
        codigo: String((d as any).codigo_rubrica).trim(),
        nome: String((d as any).descricao_rubrica ?? "").trim(),
        tipo: String((d as any).tipo_original ?? "").trim(),
      });
    }
    const novas = listarRubricasNovasParaCadastro(rubricasUnicas, codigosCadastrados);
    if (!novas.length) return 0;
    const { error } = await supabase.from("folha_rubricas_parametros").insert(
      novas.map((p) => ({ ...p, updated_at: new Date().toISOString() }))
    );
    if (error) {
      console.error("Erro ao sincronizar cadastro de rubricas:", error);
      return 0;
    }
    return novas.length;
  };

  const logFolhaAuditoria = async (
    year: number,
    month: number,
    acao: string,
    usuarioId: number | string | null | undefined,
    detalhes: Record<string, unknown>
  ) => {
    try {
      await supabase.from("folha_apuracao_auditoria").insert({
        competencia_ano: year,
        competencia_mes: month,
        acao,
        usuario_id: usuarioId ?? null,
        detalhes,
      });
    } catch (e) {
      console.error("Falha ao registrar auditoria folha:", e);
    }
  };

  // CRUD parâmetros de rubricas
  app.get("/api/folha/apuracao/rubricas", folhaApuracaoRoles, async (_req, res) => {
    const { data, error } = await supabase
      .from("folha_rubricas_parametros")
      .select("*")
      .order("codigo_rubrica");
    if (error) {
      console.error("Erro ao listar rubricas parâmetros:", error);
      return res.status(500).json({ error: "Tabela folha_rubricas_parametros indisponível. Execute sql/folha_apuracao_module.sql no Supabase." });
    }
    res.json(data ?? []);
  });

  app.post("/api/folha/apuracao/rubricas", folhaApuracaoRoles, async (req, res) => {
    const body = req.body as any;
    const codigo = String(body?.codigo_rubrica ?? "").trim();
    if (!codigo) return res.status(400).json({ error: "Informe o código da rubrica." });
    const row = {
      codigo_rubrica: codigo,
      descricao: String(body?.descricao ?? codigo).trim(),
      categoria: String(body?.categoria ?? "neutro"),
      entra_provento: Boolean(body?.entra_provento),
      entra_retorno: Boolean(body?.entra_retorno),
      entra_comissao: Boolean(body?.entra_comissao),
      entra_produtividade: Boolean(body?.entra_produtividade),
      entra_base_salario: body?.entra_base_salario !== false,
      entra_encargos: Boolean(body?.entra_encargos),
      fator_provento: Number(body?.fator_provento ?? 1),
      fator_retorno: Number(body?.fator_retorno ?? -1),
      ativo: body?.ativo !== false,
      observacoes: body?.observacoes ?? null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("folha_rubricas_parametros").upsert(row, { onConflict: "codigo_rubrica" }).select().single();
    if (error) {
      console.error("Erro ao salvar rubrica parâmetro:", error);
      return res.status(500).json({ error: "Não foi possível salvar a rubrica." });
    }
    res.json(data);
  });

  app.patch("/api/folha/apuracao/rubricas/:id", folhaApuracaoRoles, async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID inválido." });
    const body = { ...(req.body as any), updated_at: new Date().toISOString() };
    delete body.id;
    delete body.codigo_rubrica;
    const { data, error } = await supabase.from("folha_rubricas_parametros").update(body).eq("id", id).select().single();
    if (error) return res.status(500).json({ error: "Não foi possível atualizar." });
    res.json(data);
  });

  // CRUD parâmetros de encargos
  app.get("/api/folha/apuracao/encargos", folhaApuracaoRoles, async (req, res) => {
    const ano = Number((req.query as any)?.ano);
    let q = supabase.from("folha_parametros_encargos").select("*").order("ano", { ascending: false });
    if (ano) q = q.eq("ano", ano);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: "Execute sql/folha_apuracao_module.sql no Supabase." });
    res.json(data ?? []);
  });

  app.post("/api/folha/apuracao/encargos", folhaApuracaoRoles, async (req, res) => {
    const body = req.body as any;
    const ano = Number(body?.ano);
    if (!ano) return res.status(400).json({ error: "Informe o ano." });
    const row = {
      ano,
      percentual_fgts: Number(body?.percentual_fgts ?? 0.08),
      percentual_inss: Number(body?.percentual_inss ?? 0.20),
      percentual_fgts_aprendiz: Number(body?.percentual_fgts_aprendiz ?? 0.02),
      percentual_provisao_13: Number(body?.percentual_provisao_13 ?? 1 / 12),
      percentual_provisao_ferias: Number(body?.percentual_provisao_ferias ?? 1 / 12),
      percentual_um_terco_ferias: Number(body?.percentual_um_terco_ferias ?? 1 / 3),
      ativo: body?.ativo !== false,
      observacoes: body?.observacoes ?? null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("folha_parametros_encargos").upsert(row, { onConflict: "ano" }).select().single();
    if (error) return res.status(500).json({ error: "Não foi possível salvar encargos." });
    res.json(data);
  });

  // Rubricas não mapeadas (pendências)
  app.get("/api/folha/apuracao/pendencias", folhaApuracaoRoles, async (req, res) => {
    const year = Number((req.query as any)?.year) || new Date().getFullYear();
    const month = Number((req.query as any)?.month);

    const { data: rubricas, error } = await supabase
      .from("folha_rubricas")
      .select("codigo, nome, valor, tipo, year, month")
      .eq("year", year);
    if (error) return res.status(500).json({ error: "Erro ao carregar rubricas importadas." });

    const paramsMap = await loadRubricaParamsMap();
    const ignored = await loadIgnoredRubricas();
    const grouped = new Map<string, { codigo: string; descricao: string; ocorrencias: number; valor_total: number; meses: Set<number>; tipo: string }>();

    for (const rb of rubricas ?? []) {
      const codigo = String((rb as any).codigo).trim();
      if (paramsMap.has(codigo) || ignored.has(codigo)) continue;
      if (month && Number((rb as any).month) !== month) continue;
      const g = grouped.get(codigo) || {
        codigo,
        descricao: String((rb as any).nome ?? ""),
        ocorrencias: 0,
        valor_total: 0,
        meses: new Set<number>(),
        tipo: String((rb as any).tipo ?? ""),
      };
      g.ocorrencias += 1;
      g.valor_total += Number((rb as any).valor) || 0;
      g.meses.add(Number((rb as any).month));
      grouped.set(codigo, g);
    }

    res.json(
      Array.from(grouped.values()).map((g) => {
        const mesesArr = Array.from(g.meses).sort((a, b) => a - b);
        return {
          codigo_rubrica: g.codigo,
          descricao: g.descricao,
          ocorrencias: g.ocorrencias,
          valor_total: g.valor_total,
          tipo_original: g.tipo,
          meses: mesesArr,
          primeira_competencia: mesesArr.length ? `${String(mesesArr[0]).padStart(2, "0")}/${year}` : null,
          ultima_competencia: mesesArr.length ? `${String(mesesArr[mesesArr.length - 1]).padStart(2, "0")}/${year}` : null,
        };
      })
    );
  });

  // Ignorar rubrica (não entra na apuração)
  app.post("/api/folha/apuracao/rubricas/ignorar", folhaApuracaoRoles, async (req, res) => {
    const codigo = String((req.body as any)?.codigo_rubrica ?? "").trim();
    const descricao = String((req.body as any)?.descricao ?? codigo).trim();
    if (!codigo) return res.status(400).json({ error: "Informe o código." });
    const { error } = await supabase.from("folha_rubricas_ignoradas").upsert(
      { codigo_rubrica: codigo, descricao, ignorado_por: req.user?.id ?? null, ignorado_em: new Date().toISOString() },
      { onConflict: "codigo_rubrica" }
    );
    if (error) return res.status(500).json({ error: "Não foi possível ignorar rubrica." });
    res.json({ success: true });
  });

  app.delete("/api/folha/apuracao/rubricas/ignorar/:codigo", folhaApuracaoRoles, async (req, res) => {
    const codigo = String(req.params.codigo ?? "").trim();
    await supabase.from("folha_rubricas_ignoradas").delete().eq("codigo_rubrica", codigo);
    res.json({ success: true });
  });

  // Configurações globais
  app.get("/api/folha/apuracao/config", folhaApuracaoRoles, async (_req, res) => {
    res.json(await loadFolhaConfig());
  });

  app.patch("/api/folha/apuracao/config", folhaApuracaoRoles, async (req, res) => {
    const body = req.body as any;
    const { data, error } = await supabase
      .from("folha_config")
      .upsert(
        {
          id: 1,
          comissao_produtividade_separadas: body?.comissao_produtividade_separadas !== false,
          incluir_retorno_total_custo: Boolean(body?.incluir_retorno_total_custo),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      .select()
      .single();
    if (error) return res.status(500).json({ error: "Execute sql/folha_apuracao_module_v2.sql." });
    res.json(data);
  });

  // Mapear rubrica pendente rapidamente
  app.post("/api/folha/apuracao/rubricas/mapear", folhaApuracaoRoles, async (req, res) => {
    const body = req.body as any;
    const codigo = String(body?.codigo_rubrica ?? "").trim();
    const descricao = String(body?.descricao ?? codigo).trim();
    if (!codigo) return res.status(400).json({ error: "Informe o código." });

    const preset = body?.preset as string | undefined;
    let param: Omit<RubricaParametro, "id">;
    if (preset === "provento") {
      param = { codigo_rubrica: codigo, descricao, categoria: "provento", entra_provento: true, entra_retorno: false, entra_comissao: false, entra_produtividade: false, fator_provento: 1, fator_retorno: -1, ativo: true };
    } else if (preset === "desconto") {
      param = { codigo_rubrica: codigo, descricao, categoria: "desconto", entra_provento: false, entra_retorno: true, entra_comissao: false, entra_produtividade: false, fator_provento: 1, fator_retorno: -1, ativo: true };
    } else if (preset === "comissao") {
      param = { codigo_rubrica: codigo, descricao, categoria: "comissao", entra_provento: false, entra_retorno: false, entra_comissao: true, entra_produtividade: false, fator_provento: 1, fator_retorno: -1, ativo: true };
    } else if (preset === "produtividade") {
      param = { codigo_rubrica: codigo, descricao, categoria: "produtividade", entra_provento: false, entra_retorno: false, entra_comissao: false, entra_produtividade: true, fator_provento: 1, fator_retorno: -1, ativo: true };
    } else {
      param = inferirParametroRubrica(codigo, descricao, body?.tipo_original);
    }

    const { data, error } = await supabase.from("folha_rubricas_parametros").upsert({ ...param, updated_at: new Date().toISOString() }, { onConflict: "codigo_rubrica" }).select().single();
    if (error) return res.status(500).json({ error: "Não foi possível mapear rubrica." });
    res.json(data);
  });

  // Conferência da importação
  app.get("/api/folha/apuracao/conferencia", folhaApuracaoRoles, async (req, res) => {
    const year = Number((req.query as any)?.year) || new Date().getFullYear();
    const month = Number((req.query as any)?.month);
    if (!month || month < 1 || month > 12) return res.status(400).json({ error: "Informe o mês (1-12)." });

    const [{ data: funcionarios }, { data: rubricas }, { data: importacao }, { data: apuracao }, { data: detalhe }] = await Promise.all([
      supabase.from("folha_pagamento").select("matricula, nome, situacao, proventos, descontos, liquido").eq("year", year).eq("month", month),
      supabase.from("folha_rubricas").select("codigo, nome, valor, tipo").eq("year", year).eq("month", month),
      supabase.from("folha_importacoes").select("*").eq("competencia_ano", year).eq("competencia_mes", month).maybeSingle(),
      supabase.from("folha_apuracoes_mensais").select("*").eq("competencia_ano", year).eq("competencia_mes", month).maybeSingle(),
      supabase.from("folha_lancamentos_importados").select("id").eq("competencia_ano", year).eq("competencia_mes", month),
    ]);

    const paramsMap = await loadRubricaParamsMap();
    const ignored = await loadIgnoredRubricas();
    const rubricasNaoMapeadas = (rubricas ?? []).filter((r: any) => {
      const cod = String(r.codigo).trim();
      return !paramsMap.has(cod) && !ignored.has(cod);
    }).length;
    const totalProventos = (funcionarios ?? []).reduce((s: number, f: any) => s + (Number(f.proventos) || 0), 0);
    const totalDescontos = (funcionarios ?? []).reduce((s: number, f: any) => s + (Number(f.descontos) || 0), 0);

    res.json({
      year,
      month,
      importacao: importacao ?? null,
      funcionarios: (funcionarios ?? []).length,
      rubricas: (rubricas ?? []).length,
      rubricas_nao_mapeadas: rubricasNaoMapeadas,
      total_proventos_importados: totalProventos,
      total_descontos_importados: totalDescontos,
      linhas_detalhe_importadas: (detalhe ?? []).length,
      apuracao: apuracao ?? null,
      status: (funcionarios ?? []).length > 0 ? "importado" : "sem_dados",
    });
  });

  // Processar / reprocessar apuração mensal
  app.post("/api/folha/apuracao/processar", folhaApuracaoRoles, async (req, res) => {
    const year = Number((req.body as any)?.year);
    const month = Number((req.body as any)?.month);
    const force = Boolean((req.body as any)?.force);
    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ error: "Informe ano e mês válidos." });
    }

    const { data: apExistente } = await supabase
      .from("folha_apuracoes_mensais")
      .select("bloqueado")
      .eq("competencia_ano", year)
      .eq("competencia_mes", month)
      .maybeSingle();
    if (apExistente?.bloqueado) {
      if (!force) {
        return res.status(403).json({ error: "Competência bloqueada. Apenas administradores podem reprocessar com confirmação." });
      }
      if (req.user?.role !== "admin") {
        return res.status(403).json({ error: "Apenas administradores podem reprocessar competência bloqueada." });
      }
    }

    const { data: importacao } = await supabase
      .from("folha_importacoes")
      .select("id, status")
      .eq("competencia_ano", year)
      .eq("competencia_mes", month)
      .maybeSingle();

    const encargos = await loadEncargosAno(year);
    if (!encargos) {
      return res.status(400).json({ error: `Cadastre os parâmetros de encargos para ${year}.` });
    }

    const config = await loadFolhaConfig();
    const ignored = await loadIgnoredRubricas();

    // Garante cadastro de rubricas a partir da importação (equivalente à tabela de classificação da planilha)
    await sincronizarCadastroRubricasCompetencia(year, month);

    const paramsMap = await loadRubricaParamsMap();

    const { data: detalheImportado } = await supabase
      .from("folha_lancamentos_importados")
      .select("*")
      .eq("competencia_ano", year)
      .eq("competencia_mes", month);

    const { data: rubricasResumo, error: rubErr } = await supabase
      .from("folha_rubricas")
      .select("codigo, nome, horas, valor, tipo")
      .eq("year", year)
      .eq("month", month);
    if (rubErr) return res.status(500).json({ error: "Erro ao carregar rubricas do mês." });

    const rawInputs = lancamentosDaImportacao(detalheImportado ?? [], rubricasResumo ?? []);
    if (!rawInputs.length) {
      return res.status(400).json({ error: "Não há dados importados para esta competência. Importe o extrato mensal primeiro." });
    }

    const rawLancamentos = rawInputs.filter(
      (l) => !ignored.has(String(l.codigo_rubrica).trim())
    );

    const lancamentos = classificarLancamentosImportacao(rawLancamentos, paramsMap);

    const { data: funcionarios } = await supabase
      .from("folha_pagamento")
      .select("matricula, nome, cargo, situacao, cpf")
      .eq("year", year)
      .eq("month", month);

    const qtdFuncionarios = (funcionarios ?? []).length;
    const qtdTrabalhando = (funcionarios ?? []).filter((f: any) =>
      /trabalh/i.test(String(f.situacao ?? ""))
    ).length;

    const apuracao = calcularApuracaoMensal(year, month, lancamentos, encargos, qtdTrabalhando, qtdFuncionarios, config);

    if (!force && apuracao.rubricas_nao_mapeadas > 0) {
      return res.status(409).json({
        error: `Existem ${apuracao.rubricas_nao_mapeadas} rubrica(s) sem mapeamento. Classifique-as ou confirme o cálculo mesmo assim.`,
        rubricas_nao_mapeadas: apuracao.rubricas_nao_mapeadas,
      });
    }

    await supabase.from("folha_lancamentos").delete().eq("competencia_ano", year).eq("competencia_mes", month);

    const lancRows = lancamentos.map((l) => ({
      importacao_id: importacao?.id ?? null,
      competencia_ano: year,
      competencia_mes: month,
      codigo_funcionario: l.codigo_funcionario ?? null,
      nome_funcionario: l.nome_funcionario ?? null,
      cpf_funcionario: l.cpf_funcionario ?? null,
      cargo_nome: l.cargo_nome ?? null,
      setor_nome: l.setor_nome ?? null,
      situacao: l.situacao ?? null,
      codigo_rubrica: l.codigo_rubrica,
      descricao_rubrica: l.descricao_rubrica,
      tipo_original: l.tipo_original,
      quantidade: l.quantidade,
      valor_original: l.valor_original,
      valor_provento: l.valor_provento,
      valor_retorno: l.valor_retorno,
      valor_comissao: l.valor_comissao,
      valor_produtividade: l.valor_produtividade,
      status_mapeamento: l.status_mapeamento,
      updated_at: new Date().toISOString(),
    }));
    const { error: insErr } = await supabase.from("folha_lancamentos").insert(lancRows);
    if (insErr) {
      console.error("Erro ao gravar lançamentos:", insErr);
      return res.status(500).json({ error: "Não foi possível gravar lançamentos." });
    }

    const apRow = {
      ...apuracao,
      status: "calculado",
      calculado_por: req.user?.id ?? null,
      calculado_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data: saved, error: apErr } = await supabase
      .from("folha_apuracoes_mensais")
      .upsert(apRow, { onConflict: "competencia_ano,competencia_mes" })
      .select()
      .single();
    if (apErr) {
      console.error("Erro ao gravar apuração:", apErr);
      return res.status(500).json({ error: "Não foi possível gravar a apuração mensal." });
    }

    await logFolhaAuditoria(year, month, apExistente ? "reprocessar" : "processar", req.user?.id, {
      lancamentos: lancamentos.length,
      rubricas_nao_mapeadas: apuracao.rubricas_nao_mapeadas,
      encargos,
      config,
      origem: (detalheImportado?.length ?? 0) > 0 ? "detalhe_funcionario" : "resumo_rubrica",
    });

    res.json({
      success: true,
      apuracao: saved,
      resumo: {
        lancamentos_processados: lancamentos.length,
        rubricas_processadas: new Set(lancamentos.map((l) => l.codigo_rubrica)).size,
        rubricas_nao_mapeadas: apuracao.rubricas_nao_mapeadas,
        total_proventos: apuracao.total_proventos,
        total_retorno: apuracao.total_retorno,
        total_comissao: apuracao.total_comissao,
        total_produtividade: apuracao.total_produtividade,
        total_custo: apuracao.total_custo,
        calculado_em: apRow.calculado_em,
      },
    });
  });

  // Consultar apuração mensal + lançamentos (com filtros)
  app.get("/api/folha/apuracao/competencias", folhaApuracaoRoles, async (req, res) => {
    const year = Number((req.query as any)?.year) || new Date().getFullYear();
    const [{ data: importacoes }, { data: apuracoes }] = await Promise.all([
      supabase
        .from("folha_importacoes")
        .select("competencia_mes, competencia_ano, nome_arquivo, data_importacao, total_funcionarios, total_rubricas, status")
        .eq("competencia_ano", year)
        .order("competencia_mes"),
      supabase
        .from("folha_apuracoes_mensais")
        .select("competencia_mes, status, calculado_em, total_custo")
        .eq("competencia_ano", year)
        .order("competencia_mes"),
    ]);

    const apMap = new Map((apuracoes ?? []).map((a: any) => [Number(a.competencia_mes), a]));
    const meses = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const imp = (importacoes ?? []).find((row: any) => Number(row.competencia_mes) === m);
      const ap = apMap.get(m);
      return {
        month: m,
        importado: Boolean(imp),
        importacao: imp ?? null,
        apurado: Boolean(ap),
        apuracao: ap ?? null,
      };
    });

    res.json({ year, meses });
  });

  app.get("/api/folha/apuracao", folhaApuracaoRoles, async (req, res) => {
    const q = req.query as any;
    const year = Number(q?.year) || new Date().getFullYear();
    const month = Number(q?.month);
    if (!month || month < 1 || month > 12) return res.status(400).json({ error: "Informe o mês (1-12)." });

    const [
      { data: apuracao },
      { data: lancamentosRaw },
      { data: situacoes, error: sitErr },
      { count: funcCount },
      { count: rubCount },
      { data: importacao },
      { count: detCount, error: detErr },
      { data: detalheRows },
      { data: rubricasRows },
    ] = await Promise.all([
      supabase.from("folha_apuracoes_mensais").select("*").eq("competencia_ano", year).eq("competencia_mes", month).maybeSingle(),
      supabase.from("folha_lancamentos").select("*").eq("competencia_ano", year).eq("competencia_mes", month).order("codigo_rubrica"),
      supabase.from("folha_situacoes_resumo").select("*").eq("competencia_ano", year).eq("competencia_mes", month),
      supabase.from("folha_pagamento").select("*", { count: "exact", head: true }).eq("year", year).eq("month", month),
      supabase.from("folha_rubricas").select("*", { count: "exact", head: true }).eq("year", year).eq("month", month),
      supabase.from("folha_importacoes").select("*").eq("competencia_ano", year).eq("competencia_mes", month).maybeSingle(),
      supabase.from("folha_lancamentos_importados").select("*", { count: "exact", head: true }).eq("competencia_ano", year).eq("competencia_mes", month),
      supabase.from("folha_lancamentos_importados").select("*").eq("competencia_ano", year).eq("competencia_mes", month),
      supabase.from("folha_rubricas").select("codigo, nome, horas, valor, tipo").eq("year", year).eq("month", month),
    ]);

    if (sitErr) console.warn("folha_situacoes_resumo indisponível:", sitErr.message);
    if (detErr) console.warn("folha_lancamentos_importados indisponível:", detErr.message);

    const dadosImportados = (funcCount ?? 0) > 0 || (rubCount ?? 0) > 0;

    let proventosImportacao = 0;
    let rubricasPendentesProvento = 0;
    if (dadosImportados) {
      try {
        await sincronizarCadastroRubricasCompetencia(year, month);
        const paramsMap = await loadRubricaParamsMap();
        const ignored = await loadIgnoredRubricas();
        const rawImport = lancamentosDaImportacao(detalheRows ?? [], rubricasRows ?? []).filter(
          (l) => !ignored.has(String(l.codigo_rubrica).trim())
        );
        const classificados = classificarLancamentosImportacao(rawImport, paramsMap);
        proventosImportacao = calcularTotalProventos(classificados);
        rubricasPendentesProvento = new Set(
          classificados.filter((l) => l.status_mapeamento === "pendente").map((l) => l.codigo_rubrica)
        ).size;
      } catch (e) {
        console.warn("Prévia de proventos indisponível:", e);
      }
    }

    let lancamentos = lancamentosRaw ?? [];
    const filtroRubrica = String(q?.rubrica ?? "").trim();
    const filtroTipo = String(q?.tipo ?? "").trim().toUpperCase();
    const filtroFuncionario = String(q?.funcionario ?? "").trim().toLowerCase();
    const filtroCargo = String(q?.cargo ?? "").trim().toLowerCase();
    const filtroSetor = String(q?.setor ?? "").trim().toLowerCase();

    if (filtroRubrica) lancamentos = lancamentos.filter((l: any) => String(l.codigo_rubrica).includes(filtroRubrica));
    if (filtroTipo) lancamentos = lancamentos.filter((l: any) => String(l.tipo_original).toUpperCase() === filtroTipo);
    if (filtroFuncionario) {
      lancamentos = lancamentos.filter((l: any) =>
        String(l.nome_funcionario ?? "").toLowerCase().includes(filtroFuncionario) ||
        String(l.codigo_funcionario ?? "").toLowerCase().includes(filtroFuncionario)
      );
    }
    if (filtroCargo) lancamentos = lancamentos.filter((l: any) => String(l.cargo_nome ?? "").toLowerCase().includes(filtroCargo));
    if (filtroSetor) lancamentos = lancamentos.filter((l: any) => String(l.setor_nome ?? "").toLowerCase().includes(filtroSetor));

    res.json({
      year,
      month,
      apuracao: apuracao ?? null,
      lancamentos,
      situacoes: situacoes ?? [],
      importacao: importacao ?? null,
      import_status: {
        dados_importados: dadosImportados,
        funcionarios: funcCount ?? 0,
        rubricas: rubCount ?? 0,
        lancamentos_detalhe: detCount ?? 0,
        proventos_calculados: proventosImportacao,
        rubricas_pendentes: rubricasPendentesProvento,
        pronto_para_processar: dadosImportados && (rubCount ?? 0) > 0,
        aguardando_processamento: dadosImportados && !apuracao,
      },
    });
  });

  // Síntese anual com variação mês a mês
  app.get("/api/folha/apuracao/sintese", folhaApuracaoRoles, async (req, res) => {
    const year = Number((req.query as any)?.year) || new Date().getFullYear();
    const { data, error } = await supabase
      .from("folha_apuracoes_mensais")
      .select("*")
      .eq("competencia_ano", year)
      .order("competencia_mes");
    if (error) return res.status(500).json({ error: "Erro ao carregar síntese." });

    const meses = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const row = (data ?? []).find((d: any) => Number(d.competencia_mes) === m);
      return row ? { month: m, ...row } : { month: m, competencia_mes: m, competencia_ano: year, total_custo: 0, status: "pendente" };
    });

    const mesesComVariacao = meses.map((row: any, idx: number) => {
      const prev = idx > 0 ? meses[idx - 1] : null;
      const custoAtual = Number(row.total_custo) || 0;
      const custoPrev = prev ? Number((prev as any).total_custo) || 0 : 0;
      const variacao_custo_pct = custoPrev ? ((custoAtual - custoPrev) / Math.abs(custoPrev)) * 100 : null;
      const provisoes = (Number(row.provisao_13) || 0) + (Number(row.provisao_ferias) || 0) + (Number(row.provisao_um_terco_ferias) || 0);
      return { ...row, provisoes, variacao_custo_pct };
    });

    const totais = mesesComVariacao.reduce(
      (acc, row: any) => ({
        total_custo: acc.total_custo + (Number(row.total_custo) || 0),
        total_comissao: acc.total_comissao + (Number(row.total_comissao) || 0),
        total_produtividade: acc.total_produtividade + (Number(row.total_produtividade) || 0),
        total_proventos: acc.total_proventos + (Number(row.total_proventos) || 0),
        total_retorno: acc.total_retorno + (Number(row.total_retorno) || 0),
        total_salario: acc.total_salario + (Number(row.total_salario) || 0),
        provisoes: acc.provisoes + (Number(row.provisoes) || 0),
        fgts: acc.fgts + (Number(row.fgts) || 0),
        inss: acc.inss + (Number(row.inss) || 0),
      }),
      { total_custo: 0, total_comissao: 0, total_produtividade: 0, total_proventos: 0, total_retorno: 0, total_salario: 0, provisoes: 0, fgts: 0, inss: 0 }
    );

    res.json({ year, meses: mesesComVariacao, totais });
  });

  // Relatório por rubrica
  app.get("/api/folha/apuracao/relatorio/rubrica", folhaApuracaoRoles, async (req, res) => {
    const year = Number((req.query as any)?.year) || new Date().getFullYear();
    const month = Number((req.query as any)?.month);
    if (!month) return res.status(400).json({ error: "Informe o mês." });
    const { data: lancamentos } = await supabase
      .from("folha_lancamentos")
      .select("*")
      .eq("competencia_ano", year)
      .eq("competencia_mes", month);
    const paramsMap = await loadRubricaParamsMap();
    const grouped = new Map<string, any>();
    for (const l of lancamentos ?? []) {
      const cod = String((l as any).codigo_rubrica);
      const g = grouped.get(cod) || {
        codigo_rubrica: cod,
        descricao: (l as any).descricao_rubrica,
        categoria: paramsMap.get(cod)?.categoria ?? "—",
        valor_total: 0,
        ocorrencias: 0,
        funcionarios: new Set<string>(),
        setores: new Set<string>(),
      };
      g.valor_total += Number((l as any).valor_original) || 0;
      g.ocorrencias += 1;
      if ((l as any).nome_funcionario) g.funcionarios.add((l as any).nome_funcionario);
      if ((l as any).setor_nome) g.setores.add((l as any).setor_nome);
      grouped.set(cod, g);
    }
    res.json(Array.from(grouped.values()).map((g) => ({
      ...g,
      funcionarios: Array.from(g.funcionarios),
      setores: Array.from(g.setores),
    })));
  });

  // Relatório por setor (quando setor_nome disponível nos lançamentos)
  app.get("/api/folha/apuracao/relatorio/setor", folhaApuracaoRoles, async (req, res) => {
    const year = Number((req.query as any)?.year) || new Date().getFullYear();
    const month = Number((req.query as any)?.month);
    if (!month) return res.status(400).json({ error: "Informe o mês." });
    const { data: lancamentos } = await supabase
      .from("folha_lancamentos")
      .select("*")
      .eq("competencia_ano", year)
      .eq("competencia_mes", month);
    const grouped = new Map<string, any>();
    for (const l of lancamentos ?? []) {
      const setor = String((l as any).setor_nome || "Sem setor");
      const g = grouped.get(setor) || {
        setor,
        total_proventos: 0,
        total_retorno: 0,
        total_comissao: 0,
        total_produtividade: 0,
        total_salario: 0,
      };
      g.total_proventos += Number((l as any).valor_provento) || 0;
      g.total_retorno += Number((l as any).valor_retorno) || 0;
      g.total_comissao += Number((l as any).valor_comissao) || 0;
      g.total_produtividade += Number((l as any).valor_produtividade) || 0;
      grouped.set(setor, g);
    }
    const rows = Array.from(grouped.values()).map((g) => ({
      ...g,
      total_salario: g.total_proventos + g.total_comissao + g.total_produtividade,
    }));
    res.json(rows);
  });

  // Auditoria
  app.get("/api/folha/apuracao/auditoria", folhaApuracaoRoles, async (req, res) => {
    const year = Number((req.query as any)?.year);
    const month = Number((req.query as any)?.month);
    let q = supabase.from("folha_apuracao_auditoria").select("*").order("created_at", { ascending: false }).limit(100);
    if (year) q = q.eq("competencia_ano", year);
    if (month) q = q.eq("competencia_mes", month);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: "Auditoria indisponível." });
    res.json(data ?? []);
  });

  // Setores e cargos
  app.get("/api/folha/apuracao/setores", folhaApuracaoRoles, async (_req, res) => {
    const { data } = await supabase.from("folha_setores").select("*").eq("ativo", true).order("nome");
    res.json(data ?? []);
  });

  app.post("/api/folha/apuracao/setores", folhaApuracaoRoles, async (req, res) => {
    const body = req.body as any;
    const { data, error } = await supabase.from("folha_setores").upsert({
      nome: String(body?.nome ?? "").trim(),
      codigo: body?.codigo ?? null,
      ativo: body?.ativo !== false,
      updated_at: new Date().toISOString(),
    }).select().single();
    if (error) return res.status(500).json({ error: "Erro ao salvar setor." });
    res.json(data);
  });

  app.get("/api/folha/apuracao/cargos", folhaApuracaoRoles, async (_req, res) => {
    const { data } = await supabase.from("folha_cargos").select("*").eq("ativo", true).order("nome");
    res.json(data ?? []);
  });

  app.post("/api/folha/apuracao/cargos", folhaApuracaoRoles, async (req, res) => {
    const body = req.body as any;
    const { data, error } = await supabase.from("folha_cargos").insert({
      nome: String(body?.nome ?? "").trim(),
      codigo: body?.codigo ?? null,
      cbo: body?.cbo ?? null,
      setor_id: body?.setor_id ?? null,
      ativo: true,
    }).select().single();
    if (error) return res.status(500).json({ error: "Erro ao salvar cargo." });
    res.json(data);
  });

  // Sincronizar setores a partir de sectors existente
  app.post("/api/folha/apuracao/setores/sync", folhaApuracaoRoles, async (_req, res) => {
    const { data: sectors } = await supabase.from("sectors").select("id, name, code").eq("active", true);
    let count = 0;
    for (const s of sectors ?? []) {
      await supabase.from("folha_setores").upsert(
        { nome: (s as any).name, codigo: (s as any).code, sector_id: (s as any).id, ativo: true, updated_at: new Date().toISOString() },
        { onConflict: "nome" }
      );
      count += 1;
    }
    res.json({ success: true, sincronizados: count });
  });

  // Bloquear / desbloquear competência
  app.patch("/api/folha/apuracao/bloquear", folhaApuracaoRoles, async (req, res) => {
    const year = Number((req.body as any)?.year);
    const month = Number((req.body as any)?.month);
    const bloqueado = Boolean((req.body as any)?.bloqueado);
    if (!year || !month) return res.status(400).json({ error: "Informe ano e mês." });
    const { error } = await supabase
      .from("folha_apuracoes_mensais")
      .update({ bloqueado, updated_at: new Date().toISOString() })
      .eq("competencia_ano", year)
      .eq("competencia_mes", month);
    if (error) return res.status(500).json({ error: "Não foi possível atualizar bloqueio." });
    await logFolhaAuditoria(year, month, bloqueado ? "bloquear" : "desbloquear", req.user?.id, { bloqueado });
    res.json({ success: true, bloqueado });
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

    if (error) { console.error(error); return res.status(500).json({ error: "Erro interno ao processar a solicitação." }); }

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
      const { rows: monthlyRows, error: monthlyError } = await fetchMonthlyValuesByYear(selectedYear);

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
      console.error("Erro ao salvar célula da Síntase:", error);
      return res.status(500).json({ error: "Não foi possível salvar a alteração." });
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
    if (error) { console.error(error); return res.status(500).json({ error: "Erro interno ao processar a solicitação." }); }
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
    if (error) { console.error(error); return res.status(500).json({ error: "Erro interno ao processar a solicitação." }); }
    res.json({ success: true, year: Number(year), occupancy_percent: occupancyPercent });
  });

  // ====================================================
  // COMPRAS: ORDEM DE COMPRA — geração de PDF (pdfkit)
  // ====================================================
  app.post("/api/ordem-compra/pdf", async (req, res) => {
    const b = req.body as Record<string, string>;

    const fmtDate = (iso: string) => {
      if (!iso) return "___/___/______";
      const [y, m, d] = iso.split("-");
      return `${d}/${m}/${y}`;
    };
    const fmtCurrency = (v: string) => {
      const n = parseFloat(String(v ?? "").replace(",", "."));
      if (!Number.isFinite(n)) return "R$ —";
      return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const FATURAMENTO_LABEL: Record<string, string> = {
      nf_recibo: "Emissão de Nota Fiscal + Recibo",
      recibo: "Emissão de Recibo (sem nota fiscal)",
    };
    const PAGAMENTO_LABEL: Record<string, string> = {
      cartao: "Cartão de Crédito",
      avista: "À Vista — Efetivo",
      boleto: "Boleto Bancário — máximo de prazo possível considerando o vencimento",
      pix: "PIX",
    };

    try {
      const doc = new PDFDocument({ margin: 45, size: "A4" });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => {
        const pdf = Buffer.concat(chunks);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="ordem_compra.pdf"`);
        res.send(pdf);
      });

      const W = doc.page.width - 90; // largura útil
      const X = 45;
      const TEAL = "#004D40";
      const GRAY = "#64748B";
      const LINE = "#E2E8F0";

      // ── CABEÇALHO ──────────────────────────────────────────────────────
      doc.rect(X, 40, W, 50).fill(TEAL);
      doc.fillColor("white").fontSize(16).font("Helvetica-Bold")
         .text("ORDEM DE COMPRA", X + 12, 52, { width: W - 12 });
      doc.fontSize(9).font("Helvetica")
         .text("VIVAZ CATARATAS RESORT", X + 12, 72, { width: W - 12 });

      // Data — canto direito do header
      doc.fillColor("white").fontSize(8).font("Helvetica")
         .text(`Data: ${fmtDate(b.data_execucao)}`, X, 56, { width: W - 12, align: "right" });

      doc.y = 105;

      // ── helper de seção ─────────────────────────────────────────────────
      const sectionTitle = (title: string) => {
        doc.moveDown(0.4);
        doc.rect(X, doc.y, W, 16).fill("#F1F5F9");
        doc.fillColor(TEAL).fontSize(7.5).font("Helvetica-Bold")
           .text(title.toUpperCase(), X + 6, doc.y + 4, { width: W - 12 });
        doc.y += 20;
      };

      const row = (label: string, value: string, opts?: { bold?: boolean }) => {
        const yStart = doc.y;
        doc.fillColor(GRAY).fontSize(7).font("Helvetica")
           .text(label + ":", X, yStart, { continued: false });
        doc.fillColor("#0F172A").fontSize(8.5)
           .font(opts?.bold ? "Helvetica-Bold" : "Helvetica")
           .text(value || "—", X + 90, yStart, { width: W - 90 });
        const yEnd = doc.y;
        doc.y = Math.max(yStart + 16, yEnd + 2);
      };

      const twoCol = (items: [string, string][]) => {
        const colW = (W - 12) / items.length;
        const yStart = doc.y;
        let xOff = X;
        for (const [label, value] of items) {
          doc.fillColor(GRAY).fontSize(7).font("Helvetica").text(label + ":", xOff, yStart);
          doc.fillColor("#0F172A").fontSize(8.5).font("Helvetica").text(value || "—", xOff, yStart + 11, { width: colW - 6 });
          xOff += colW + 6;
        }
        doc.y = yStart + 28;
      };

      const checkRow = (label: string, checked: boolean, note?: string) => {
        const mark = checked ? "☑" : "☐";
        doc.fillColor(checked ? TEAL : GRAY).fontSize(9).font("Helvetica-Bold")
           .text(mark, X, doc.y, { continued: true });
        doc.fillColor(checked ? "#0F172A" : GRAY).font(checked ? "Helvetica-Bold" : "Helvetica")
           .fontSize(8.5).text(`  ${label}${note ? "  " + note : ""}`, { lineBreak: true });
        doc.y += 2;
      };

      const divider = () => {
        doc.moveTo(X, doc.y).lineTo(X + W, doc.y).strokeColor(LINE).lineWidth(0.5).stroke();
        doc.y += 6;
      };

      // ── PRESTADOR ────────────────────────────────────────────────────────
      sectionTitle("Prestador");
      twoCol([
        ["Prestador", b.prestador],
        ["Telefone", b.telefone],
      ]);
      twoCol([
        ["CNPJ / CPF", b.cnpj_cpf],
        ["Nome do titular", b.nome_titular],
      ]);

      // ── SERVIÇO ──────────────────────────────────────────────────────────
      if (b.servico_executado || b.servico_setor || b.servico_crd) {
        sectionTitle("Serviço Executado");
        row("Descrição", b.servico_executado);
        twoCol([["Setor", b.servico_setor], ["CRD", b.servico_crd]]);
      }

      // ── MATERIAIS ────────────────────────────────────────────────────────
      if (b.materiais_descricao || b.materiais_setor || b.materiais_crd) {
        sectionTitle("Materiais");
        row("Descrição", b.materiais_descricao);
        twoCol([["Setor", b.materiais_setor], ["CRD", b.materiais_crd]]);
      }

      // ── VALOR ───────────────────────────────────────────────────────────
      sectionTitle("Valor");
      doc.rect(X, doc.y, W, 22).fill("#F0FDF4");
      doc.fillColor(TEAL).fontSize(12).font("Helvetica-Bold")
         .text(`VALOR A SER PAGO: ${fmtCurrency(b.valor)}`, X + 8, doc.y + 5, { width: W - 16 });
      doc.y += 28;

      // ── FATURAMENTO ─────────────────────────────────────────────────────
      sectionTitle("Faturamento");
      checkRow("Emissão de Nota Fiscal + Recibo", b.faturamento === "nf_recibo");
      checkRow("Emissão de Recibo (sem nota fiscal)", b.faturamento === "recibo");

      // ── PAGAMENTO ───────────────────────────────────────────────────────
      sectionTitle("Condições de Pagamento");
      checkRow("Cartão de Crédito", b.pagamento === "cartao");
      checkRow("À Vista — Efetivo", b.pagamento === "avista");
      checkRow("Boleto Bancário — máximo de prazo possível considerando o vencimento", b.pagamento === "boleto");
      checkRow("PIX", b.pagamento === "pix", b.pagamento === "pix" && b.pix_chave ? `  Chave: ${b.pix_chave}` : "");
      doc.moveDown(0.3);
      twoCol([
        ["Banco", b.banco],
        ["Agência", b.agencia],
        ["C/C", b.conta_corrente],
      ]);

      // ── OBS ─────────────────────────────────────────────────────────────
      if (b.observacao) {
        sectionTitle("Observações");
        doc.fillColor("#0F172A").fontSize(8.5).font("Helvetica")
           .text(b.observacao, X, doc.y, { width: W });
        doc.y += 8;
      }

      // ── AVISOS ──────────────────────────────────────────────────────────
      sectionTitle("Informações Importantes");
      const avisos = [
        "Consultar o orçamento mensal para contratação de Serviços.",
        "Valores acima de R$ 800,00 — Colher assinatura da Diretoria.",
        "Pagamentos com mínimo de 10 dias úteis após a entrega da nota fiscal no financeiro.",
        "Pagamentos via Banco: Terças e Quintas — SOMENTE ATÉ AS 10H00.",
        "Pagamentos à Vista via caixa — Quintas após 14h00. Ordens entregues com mínimo 3 dias antecipado.",
        "Solicitar aos prestadores inserir a chave PIX no corpo da nota Fiscal.",
      ];
      for (const a of avisos) {
        doc.fillColor(GRAY).fontSize(7.5).font("Helvetica")
           .text(`• ${a}`, X, doc.y, { width: W });
        doc.y += 2;
      }

      // ── ASSINATURAS ─────────────────────────────────────────────────────
      doc.moveDown(1.2);
      divider();
      const sigY = doc.y + 30;
      const sigW = (W - 20) / 3;
      const sigs = [
        b.solicitado_por || "Solicitado por",
        "Autorizado — Gerência",
        "Autorizado — Diretoria\nLuiza Mello",
      ];
      sigs.forEach((label, i) => {
        const sx = X + i * (sigW + 10);
        doc.moveTo(sx, sigY).lineTo(sx + sigW, sigY).strokeColor("#94A3B8").lineWidth(0.8).stroke();
        doc.fillColor(GRAY).fontSize(7).font("Helvetica")
           .text(label, sx, sigY + 4, { width: sigW, align: "center" });
      });

      doc.y = sigY + 36;
      divider();

      const sig2Y = doc.y + 28;
      const sigs2 = ["Supervisora ADM — Cristiane Queiroz", "Controller — Elton Roque"];
      const sig2W = (W - 20) / 2;
      sigs2.forEach((label, i) => {
        const sx = X + i * (sig2W + 20);
        doc.moveTo(sx, sig2Y).lineTo(sx + sig2W, sig2Y).strokeColor("#94A3B8").lineWidth(0.8).stroke();
        doc.fillColor(GRAY).fontSize(7).font("Helvetica")
           .text(label, sx, sig2Y + 4, { width: sig2W, align: "center" });
      });

      // ── RODAPÉ ──────────────────────────────────────────────────────────
      doc.y = sig2Y + 40;
      doc.fillColor(GRAY).fontSize(7.5).font("Helvetica")
         .text(`Foz do Iguaçu, ${fmtDate(b.data_execucao)}`, X, doc.y, { width: W, align: "right" });

      doc.end();
    } catch (err: any) {
      console.error("Erro ao gerar PDF da Ordem de Compra:", err);
      res.status(500).json({ error: "Falha ao gerar o PDF.", detail: err?.message });
    }
  });

  // Lista os subgrupos de USO E CONSUMO (SEM CRD) cadastrados.
  app.get("/api/uso-consumo-subgrupos", async (_req, res) => {
    const { data, error } = await supabase
      .from("uso_consumo_subgrupos")
      .select("id, tipo, grupo, codigo, nome")
      .order("id", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data ?? []);
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
      const { rows: monthlyRows, error: monthlyError } = await fetchMonthlyValuesByYear(selectedYear);

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
      .neq("status", "cancelled")
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

    // Realizado importado (ex.: total do Consumo Interno por mês).
    const { data: realizadoImport } = await supabase
      .from("crd_realizado")
      .select("crd_id, month, value")
      .eq("year", selectedYear);
    for (const row of realizadoImport ?? []) {
      addRealized(Number((row as any).crd_id), Number((row as any).month), (row as any).value);
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
  // ORÇAMENTO 2026 (editável + calculado)
  // Replica a aba "Orçamento 2026": orçado por conta/mês (editável),
  // comparado com o realizado do ano anterior e a variação percentual.
  // ====================================================

  // Soma o realizado (faturas + requisições) por crd_id e mês para um ano.
  const computeRealizedByCrdMonth = async (
    year: number,
    crdData: any[]
  ): Promise<Map<string, number>> => {
    const dateFrom = `${year}-01-01`;
    const dateTo = `${year}-12-31`;
    const crdBySectorAndCode = new Map<string, number>();
    for (const c of crdData ?? []) {
      const sectorId = Number((c as any).sector_id);
      const code = String((c as any).code || "").trim();
      crdBySectorAndCode.set(`${sectorId}:${code}`, Number((c as any).id));
    }

    const realized = new Map<string, number>();
    const add = (crdId: number, month: number, amount: any) => {
      if (!Number.isFinite(crdId) || !Number.isFinite(month) || month < 1 || month > 12) return;
      const key = `${crdId}:${month}`;
      realized.set(key, (realized.get(key) || 0) + sanitizeMonthBudget(amount));
    };

    const { data: invoiceData } = await supabase
      .from("invoices")
      .select("amount, due_date, sector_id, crd, flow_stage")
      .gte("due_date", dateFrom)
      .lte("due_date", dateTo)
      .neq("flow_stage", "cancelled");
    for (const invoice of invoiceData ?? []) {
      const date = new Date(String((invoice as any).due_date || ""));
      if (Number.isNaN(date.getTime())) continue;
      const sectorId = Number((invoice as any).sector_id);
      const code = String((invoice as any).crd || "").trim();
      if (!code || !Number.isFinite(sectorId)) continue;
      const crdId = crdBySectorAndCode.get(`${sectorId}:${code}`);
      if (!crdId) continue;
      add(crdId, date.getMonth() + 1, (invoice as any).amount);
    }

    const { data: reqData } = await supabase
      .from("requisitions")
      .select("amount, date, status, crd_id")
      .neq("status", "cancelled")
      .gte("date", dateFrom)
      .lte("date", dateTo);
    for (const reqRow of reqData ?? []) {
      const date = new Date(String((reqRow as any).date || ""));
      if (Number.isNaN(date.getTime())) continue;
      add(Number((reqRow as any).crd_id), date.getMonth() + 1, (reqRow as any).amount);
    }

    return realized;
  };

  app.get("/api/orcamento", async (req, res) => {
    const { year, crd } = req.query as { year?: string; crd?: string };
    const selectedYear = Number(year) || 2026;
    const previousYear = selectedYear - 1;
    const crdFilter = normalizeCrdFilterText(crd || "");

    const { data: crdData, error } = await supabase
      .from("crds")
      .select("id, code, name, sector_id, previsto_mes, sectors(name)")
      .eq("active", true)
      .order("code");
    if (error) {
      console.error("Erro ao carregar CRDs do orçamento:", error);
      return res.status(500).json({ error: "Erro interno ao processar a solicitação." });
    }

    // Orçado do ano (editável) a partir de crd_monthly_values, com fallback em previsto_mes.
    const orcadoByKey = new Map<string, number>();
    const { rows: monthlyRows } = await fetchMonthlyValuesByYear(selectedYear);
    for (const row of (monthlyRows ?? []) as CrdMonthlyValueRow[]) {
      orcadoByKey.set(`${row.crd_id}:${row.month}`, sanitizeMonthBudget(row.value));
    }

    // Realizado do ano anterior, para o comparativo (igual ao OFFSET de "Prev x Real 2025").
    const realizedPrev = await computeRealizedByCrdMonth(previousYear, crdData ?? []);

    const rows = (crdData ?? [])
      .map((item: any) => {
        const crdId = Number(item.id);
        const monthlyBudget = sanitizeMonthBudget(item.previsto_mes);
        const orcado = Array.from({ length: 12 }, (_, i) =>
          orcadoByKey.get(`${crdId}:${i + 1}`) ?? monthlyBudget
        );
        const anterior = Array.from({ length: 12 }, (_, i) => realizedPrev.get(`${crdId}:${i + 1}`) || 0);
        const total_orcado = orcado.reduce((s, v) => s + v, 0);
        const total_anterior = anterior.reduce((s, v) => s + v, 0);
        // Variação = orçado / realizado_anterior - 1 (N.A. quando não há base anterior).
        const variacao = total_anterior !== 0 ? total_orcado / total_anterior - 1 : null;
        return {
          id: crdId,
          crd: String(item.sectors?.name || "Sem CRD"),
          grupo: String(item.code || ""),
          detalhado: String(item.name || ""),
          orcado,
          anterior,
          total_orcado,
          total_anterior,
          variacao,
        };
      })
      .filter((row) => {
        if (!crdFilter) return true;
        return (
          normalizeCrdFilterText(row.crd).includes(crdFilter) ||
          row.grupo.toLowerCase().includes(crdFilter) ||
          row.detalhado.toLowerCase().includes(crdFilter)
        );
      });

    const totalsOrcadoMonths = Array.from({ length: 12 }, (_, i) =>
      rows.reduce((s, r) => s + (r.orcado[i] || 0), 0)
    );
    const totalsAnteriorMonths = Array.from({ length: 12 }, (_, i) =>
      rows.reduce((s, r) => s + (r.anterior[i] || 0), 0)
    );
    const totalOrcado = totalsOrcadoMonths.reduce((s, v) => s + v, 0);
    const totalAnterior = totalsAnteriorMonths.reduce((s, v) => s + v, 0);

    res.json({
      year: selectedYear,
      previous_year: previousYear,
      filters: { crd: crdFilter || null },
      rows,
      totals: {
        orcado_months: totalsOrcadoMonths,
        anterior_months: totalsAnteriorMonths,
        orcado: totalOrcado,
        anterior: totalAnterior,
        variacao: totalAnterior !== 0 ? totalOrcado / totalAnterior - 1 : null,
      },
    });
  });

  app.patch("/api/orcamento/cell", async (req, res) => {
    const { crd_id, month, year, value } = req.body as {
      crd_id?: number;
      month?: number;
      year?: number;
      value?: number | string;
    };
    if (!Number.isFinite(Number(crd_id))) return res.status(400).json({ error: "crd_id inválido" });
    if (!Number.isFinite(Number(month)) || Number(month) < 1 || Number(month) > 12) {
      return res.status(400).json({ error: "month deve estar entre 1 e 12" });
    }
    if (!Number.isFinite(Number(year))) return res.status(400).json({ error: "year inválido" });

    // O orçado é o valor base (sem fator de ocupação) — mesma tabela da Síntase.
    const sanitizedValue = sanitizeMonthBudget(value);
    const { error } = await supabase
      .from("crd_monthly_values")
      .upsert(
        { crd_id: Number(crd_id), year: Number(year), month: Number(month), value: sanitizedValue },
        { onConflict: "crd_id,year,month" }
      );
    if (error) {
      console.error("Erro ao salvar célula do orçamento:", error);
      return res.status(500).json({ error: "Não foi possível salvar a alteração." });
    }
    res.json({ success: true, saved: { crd_id: Number(crd_id), month: Number(month), year: Number(year), value: sanitizedValue } });
  });

  // Importa o orçado da planilha (aba_004_Or_amento_2026.json) para o banco.
  // Lê as colunas "Prev" (G,J,M,...,AN = orçado de Jan a Dez), casa cada conta
  // pelo código entre parênteses com crds.code e grava em crd_monthly_values.
  const PREV_COLUMNS = [7, 10, 13, 16, 19, 22, 25, 28, 31, 34, 37, 40];
  const normalizeName = (v: string) =>
    String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

  const baseAccountName = (s: string) => normalizeName(String(s || "").replace(/\s*\(\d+\)\s*$/, ""));

  const parseOrcamentoSheet = (): Array<{
    code: string;
    name: string;
    groupHint: string;
    sectorHint: string;
    months: number[];
  }> => {
    const filePath = path.join(planilhasDir, "aba_004_Or_amento_2026.json");
    const j = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const byKey = new Map<string, any>();
    for (const c of j.celulas) byKey.set(`${c.linha}:${c.coluna}`, c);
    const textAt = (linha: number, coluna: number) => {
      const c = byKey.get(`${linha}:${coluna}`);
      return String(c?.valor ?? c?.valorCalculado ?? c?.valorReal ?? "");
    };
    const numAt = (linha: number, coluna: number) => {
      const c = byKey.get(`${linha}:${coluna}`);
      if (!c) return 0;
      return sanitizeMonthBudget(c.valorReal ?? c.valorCalculado ?? c.valor);
    };
    const out: Array<{ code: string; name: string; groupHint: string; sectorHint: string; months: number[] }> = [];
    for (let r = 1; r <= (j.totalLinhas || 0); r++) {
      const name = textAt(r, 6); // coluna F
      const codeMatch = name.match(/\((\d+)\)\s*$/);
      if (!codeMatch) continue;
      const groupHint = textAt(r, 2); // coluna B = macro/setor (FINANCEIRO, OPERACIONAL...)
      const sectorHint = textAt(r, 3); // coluna C = subgrupo
      const months = PREV_COLUMNS.map((col) => numAt(r, col));
      out.push({ code: codeMatch[1], name, groupHint, sectorHint, months });
    }
    return out;
  };

  app.post("/api/orcamento/import", requireRole("admin"), async (req, res) => {
    const year = Number((req.body as any)?.year) || 2026;
    // Quando true, cria os CRDs (e setores) que existem na planilha mas não no banco.
    const createMissing = (req.body as any)?.create_missing === true;
    try {
      const accounts = parseOrcamentoSheet();

      const { data: allCrds, error: crdErr } = await supabase
        .from("crds")
        .select("id, code, name, sector_id, sectors(name)");
      if (crdErr) {
        console.error("Erro ao carregar CRDs para import:", crdErr);
        return res.status(500).json({ error: "Erro ao carregar CRDs." });
      }

      // Índices de busca: por código e por nome-base (sem o "(código)").
      const crdsByCode = new Map<string, any[]>();
      const crdsByBaseName = new Map<string, any[]>();
      for (const c of allCrds ?? []) {
        const code = String((c as any).code || "").trim();
        if (code) {
          if (!crdsByCode.has(code)) crdsByCode.set(code, []);
          crdsByCode.get(code)!.push(c);
        }
        const bn = baseAccountName((c as any).name);
        if (bn) {
          if (!crdsByBaseName.has(bn)) crdsByBaseName.set(bn, []);
          crdsByBaseName.get(bn)!.push(c);
        }
      }

      // Setores existentes (para criar CRDs faltantes mapeando pela coluna B).
      const { data: sectorsData } = await supabase.from("sectors").select("id, name");
      const sectorIdByName = new Map<string, number>();
      for (const s of sectorsData ?? []) sectorIdByName.set(normalizeName((s as any).name), Number((s as any).id));

      const resolveSectorId = async (groupHint: string): Promise<number | null> => {
        const key = normalizeName(groupHint) || "sem grupo";
        if (sectorIdByName.has(key)) return sectorIdByName.get(key)!;
        // Cria o setor caso não exista (ex.: "Diretoria").
        const niceName = (groupHint || "Sem grupo").trim();
        const { data: created, error } = await supabase
          .from("sectors")
          .insert({ name: niceName, budget_limit: 0 })
          .select("id")
          .single();
        if (error || !created) {
          console.error("Falha ao criar setor:", niceName, error);
          return sectorIdByName.get("sem grupo") ?? null;
        }
        sectorIdByName.set(key, Number(created.id));
        return Number(created.id);
      };

      const upsertRows: Array<{ crd_id: number; year: number; month: number; value: number }> = [];
      const matched: string[] = [];
      const created: string[] = [];
      const unmatched: Array<{ code: string; name: string; reason: string }> = [];

      for (const acc of accounts) {
        // Candidatos por nome-base OU código (união, sem duplicar por id).
        const set = new Map<number, any>();
        for (const c of crdsByBaseName.get(baseAccountName(acc.name)) || []) set.set(Number(c.id), c);
        for (const c of crdsByCode.get(acc.code) || []) set.set(Number(c.id), c);
        const candidates = [...set.values()];

        let crdId: number | null = null;
        if (candidates.length === 1) {
          crdId = Number(candidates[0].id);
          matched.push(acc.code);
        } else if (candidates.length > 1) {
          unmatched.push({ code: acc.code, name: acc.name, reason: "ambíguo (vários CRDs casam por nome/código)" });
          continue;
        } else if (createMissing) {
          const sectorId = await resolveSectorId(acc.groupHint);
          const { data: newCrd, error } = await supabase
            .from("crds")
            .insert({
              code: acc.code,
              name: acc.name,
              sector_id: sectorId,
              previsto_mes: 0,
              active: true,
            })
            .select("id")
            .single();
          if (error || !newCrd) {
            console.error("Falha ao criar CRD:", acc.name, error);
            unmatched.push({ code: acc.code, name: acc.name, reason: "falha ao criar CRD" });
            continue;
          }
          crdId = Number(newCrd.id);
          created.push(acc.code);
        } else {
          unmatched.push({ code: acc.code, name: acc.name, reason: "sem CRD correspondente no banco" });
          continue;
        }

        if (crdId !== null) {
          acc.months.forEach((value, idx) => {
            upsertRows.push({ crd_id: crdId as number, year, month: idx + 1, value });
          });
        }
      }

      // Grava em lotes para não estourar o limite de payload.
      let written = 0;
      const chunkSize = 500;
      for (let i = 0; i < upsertRows.length; i += chunkSize) {
        const chunk = upsertRows.slice(i, i + chunkSize);
        const { error } = await supabase
          .from("crd_monthly_values")
          .upsert(chunk, { onConflict: "crd_id,year,month" });
        if (error) {
          console.error("Erro ao gravar lote do import:", error);
          return res.status(500).json({ error: "Falha ao gravar os valores no banco.", written });
        }
        written += chunk.length;
      }

      await logImportHistory({
        source_type: "orcamento",
        status: "success",
        year,
        records_count: written,
        user: req.user,
        summary: {
          accounts_in_sheet: accounts.length,
          matched: matched.length,
          created: created.length,
          unmatched_count: unmatched.length,
          rows_written: written,
        },
      });

      res.json({
        success: true,
        year,
        accounts_in_sheet: accounts.length,
        matched: matched.length,
        created: created.length,
        unmatched_count: unmatched.length,
        rows_written: written,
        unmatched: unmatched.slice(0, 50),
      });
    } catch (err: any) {
      console.error("Erro no import do orçamento:", err);
      await logImportHistory({
        source_type: "orcamento",
        status: "error",
        year,
        user: req.user,
        error_message: String(err?.message || "Não foi possível importar a planilha.").slice(0, 500),
      });
      res.status(500).json({ error: "Não foi possível importar a planilha." });
    }
  });

  // ====================================================
  // AJUSTES (editável + calculado)
  // Replica a aba "Ajustes": grade conta × mês de ajustes manuais.
  // Cabeçalhos = datas de fim de mês (cadeia EOMONTH a partir de Jan).
  // ====================================================

  // Gera as 12 datas de fim de mês do ano (igual ao EOMONTH da planilha).
  const monthEndDates = (year: number) =>
    Array.from({ length: 12 }, (_, i) => {
      const d = new Date(year, i + 1, 0);
      return {
        month: i + 1,
        label: `Real${i + 1}`,
        date: `${String(d.getDate()).padStart(2, "0")}/${String(i + 1).padStart(2, "0")}/${year}`,
      };
    });

  // Extrai número de uma célula da planilha (aceita number ou string BR com parênteses negativos).
  const cellToNumber = (c: any): number => {
    if (!c) return 0;
    const raw = c.valorReal ?? c.valorCalculado;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    let s = String(c.valor ?? "").trim();
    if (!s) return 0;
    const negative = /^\(.*\)$/.test(s);
    s = s.replace(/[()]/g, "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.\-]/g, "");
    const n = Number(s);
    if (!Number.isFinite(n)) return 0;
    return negative ? -Math.abs(n) : n;
  };

  app.get("/api/ajustes", async (req, res) => {
    const year = Number((req.query as any)?.year) || 2026;
    const { data, error } = await supabase
      .from("orcamento_ajustes")
      .select("account_name, month, value")
      .eq("year", year);
    if (error) {
      console.error("Erro ao carregar ajustes:", error);
      return res.status(500).json({ error: "Erro interno ao processar a solicitação." });
    }

    const byAccount = new Map<string, number[]>();
    for (const row of data ?? []) {
      const name = String((row as any).account_name || "");
      if (!byAccount.has(name)) byAccount.set(name, Array.from({ length: 12 }, () => 0));
      const m = Number((row as any).month);
      if (m >= 1 && m <= 12) byAccount.get(name)![m - 1] = sanitizeMonthBudget((row as any).value);
    }

    const rows = Array.from(byAccount.entries())
      .map(([account_name, values]) => ({
        account_name,
        values,
        total: values.reduce((s, v) => s + v, 0),
      }))
      .sort((a, b) => a.account_name.localeCompare(b.account_name));

    const totalsMonths = Array.from({ length: 12 }, (_, i) => rows.reduce((s, r) => s + (r.values[i] || 0), 0));

    res.json({
      year,
      months: monthEndDates(year),
      rows,
      totals: { months: totalsMonths, total: totalsMonths.reduce((s, v) => s + v, 0) },
    });
  });

  app.patch("/api/ajustes/cell", async (req, res) => {
    const { account_name, month, year, value } = req.body as {
      account_name?: string;
      month?: number;
      year?: number;
      value?: number | string;
    };
    const name = String(account_name || "").trim();
    if (!name) return res.status(400).json({ error: "account_name é obrigatório" });
    if (!Number.isFinite(Number(month)) || Number(month) < 1 || Number(month) > 12) {
      return res.status(400).json({ error: "month deve estar entre 1 e 12" });
    }
    if (!Number.isFinite(Number(year))) return res.status(400).json({ error: "year inválido" });

    const sanitizedValue = sanitizeMonthBudget(value);
    const { error } = await supabase
      .from("orcamento_ajustes")
      .upsert(
        { account_name: name, year: Number(year), month: Number(month), value: sanitizedValue },
        { onConflict: "account_name,year,month" }
      );
    if (error) {
      console.error("Erro ao salvar ajuste:", error);
      return res.status(500).json({ error: "Não foi possível salvar a alteração." });
    }
    res.json({ success: true, saved: { account_name: name, month: Number(month), year: Number(year), value: sanitizedValue } });
  });

  app.post("/api/ajustes/import", requireRole("admin"), async (req, res) => {
    const year = Number((req.body as any)?.year) || 2026;
    try {
      const filePath = path.join(planilhasDir, "aba_003_Ajustes.json");
      const j = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const byKey = new Map<string, any>();
      for (const c of j.celulas) byKey.set(`${c.linha}:${c.coluna}`, c);

      // Linhas de conta começam na linha 3 (linha 1 = rótulos, linha 2 = datas).
      // Coluna B (2) = nome da conta; colunas C..N (3..14) = ajustes de Jan..Dez.
      const VALUE_COLUMNS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
      const merged = new Map<string, number[]>();
      for (let r = 3; r <= (j.totalLinhas || 0); r++) {
        const nameCell = byKey.get(`${r}:2`);
        const name = String(nameCell?.valor ?? nameCell?.valorCalculado ?? "").trim();
        if (!name) continue;
        const months = VALUE_COLUMNS.map((col) => cellToNumber(byKey.get(`${r}:${col}`)));
        // Mescla contas repetidas (a coluna A da planilha sinaliza duplicadas).
        if (!merged.has(name)) merged.set(name, Array.from({ length: 12 }, () => 0));
        const acc = merged.get(name)!;
        months.forEach((v, i) => (acc[i] += v));
      }

      const upsertRows: Array<{ account_name: string; year: number; month: number; value: number }> = [];
      for (const [account_name, months] of merged.entries()) {
        months.forEach((value, i) => upsertRows.push({ account_name, year, month: i + 1, value }));
      }

      let written = 0;
      const chunkSize = 500;
      for (let i = 0; i < upsertRows.length; i += chunkSize) {
        const chunk = upsertRows.slice(i, i + chunkSize);
        const { error } = await supabase
          .from("orcamento_ajustes")
          .upsert(chunk, { onConflict: "account_name,year,month" });
        if (error) {
          console.error("Erro ao gravar lote de ajustes:", error);
          return res.status(500).json({ error: "Falha ao gravar os ajustes no banco.", written });
        }
        written += chunk.length;
      }

      await logImportHistory({
        source_type: "ajustes",
        status: "success",
        year,
        records_count: merged.size,
        user: req.user,
        summary: { accounts: merged.size, rows_written: written },
      });

      res.json({ success: true, year, accounts: merged.size, rows_written: written });
    } catch (err: any) {
      console.error("Erro no import de ajustes:", err);
      await logImportHistory({
        source_type: "ajustes",
        status: "error",
        year,
        user: req.user,
        error_message: String(err?.message || "Não foi possível importar a planilha de ajustes.").slice(0, 500),
      });
      res.status(500).json({ error: "Não foi possível importar a planilha de ajustes." });
    }
  });

  // ====================================================
  // SCENARIOS
  // ====================================================
  app.get("/api/scenarios", async (_req, res) => {
    const { data, error } = await supabase.from("scenarios").select("*");
    if (error) { console.error(error); return res.status(500).json({ error: "Erro interno ao processar a solicitação." }); }
    res.json(data);
  });

  // Tratador de erros de upload (ex.: arquivo acima do limite) e fallback genérico.
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err && (err as any).code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "Arquivo muito grande. O limite é de 20 MB." });
    }
    console.error("Erro não tratado:", err);
    res.status(500).json({ error: "Erro interno do servidor." });
  });

  return app;
}
