import type { SupabaseClient } from "@supabase/supabase-js";

export type SectorRow = {
  id: number;
  name: string;
  code: string | null;
  active?: boolean;
  budget_limit?: number;
};

export type ResolvedSector = {
  id: number;
  code: string;
  name: string;
};

export type SectorResolveInput = {
  code?: string | number | null;
  name?: string | null;
  /** Cria setor quando não encontrado (padrão: true em imports). */
  create?: boolean;
  budget_limit?: number;
};

/** Normaliza nome para comparação (sem acentos, minúsculas). */
export function normalizeSectorName(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** Normaliza código do setor (string trim, sem espaços extras). */
export function normalizeSectorCode(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  return raw;
}

/** Gera código slug a partir do nome quando o ERP não fornece código. */
export function slugSectorCodeFromName(name: string): string {
  return normalizeSectorName(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

/** Extrai código e nome de textos do extrato (ex.: "01 - RH", "RH (01)"). */
export function parseSectorText(raw: string): { code: string | null; name: string } {
  const text = String(raw || "").trim();
  if (!text) return { code: null, name: "" };

  const paren = text.match(/^(.+?)\s*\((\d+)\)\s*$/);
  if (paren) {
    return { name: paren[1].trim(), code: paren[2] };
  }

  const prefix = text.match(/^(\d+)\s*[-–—/\\.:]\s*(.+)$/);
  if (prefix) {
    return { code: prefix[1], name: prefix[2].trim() };
  }

  const suffix = text.match(/^(.+?)\s*[-–—/\\.:]\s*(\d+)$/);
  if (suffix) {
    return { name: suffix[1].trim(), code: suffix[2] };
  }

  if (/^\d+$/.test(text)) {
    return { code: text, name: text };
  }

  return { code: null, name: text };
}

export class SectorCache {
  private byCode = new Map<string, SectorRow>();
  private byName = new Map<string, SectorRow>();
  private loadedAt = 0;

  constructor(private readonly supabase: SupabaseClient) {}

  async reload(force = false): Promise<void> {
    const staleMs = 30_000;
    if (!force && this.loadedAt && Date.now() - this.loadedAt < staleMs) return;

    const { data, error } = await this.supabase.from("sectors").select("id, name, code, active, budget_limit");
    if (error) throw error;

    this.byCode.clear();
    this.byName.clear();
    for (const row of data ?? []) {
      const sector: SectorRow = {
        id: Number((row as any).id),
        name: String((row as any).name ?? "").trim(),
        code: normalizeSectorCode((row as any).code),
        active: (row as any).active !== false,
        budget_limit: Number((row as any).budget_limit) || 0,
      };
      if (!sector.id || !sector.name) continue;
      this.byName.set(normalizeSectorName(sector.name), sector);
      if (sector.code) this.byCode.set(sector.code, sector);
    }
    this.loadedAt = Date.now();
  }

  getByCode(code: string | null | undefined): SectorRow | undefined {
    const key = normalizeSectorCode(code);
    return key ? this.byCode.get(key) : undefined;
  }

  getByName(name: string | null | undefined): SectorRow | undefined {
    const key = normalizeSectorName(String(name || ""));
    return key ? this.byName.get(key) : undefined;
  }

  remember(sector: SectorRow): void {
    this.byName.set(normalizeSectorName(sector.name), sector);
    if (sector.code) this.byCode.set(sector.code, sector);
  }
}

let sharedCache: SectorCache | null = null;

export function getSectorCache(supabase: SupabaseClient): SectorCache {
  if (!sharedCache) sharedCache = new SectorCache(supabase);
  return sharedCache;
}

/** Resolve (ou cria) setor priorizando código; nome é fallback e rótulo exibível. */
export async function resolveSector(
  supabase: SupabaseClient,
  input: SectorResolveInput,
  cache?: SectorCache
): Promise<ResolvedSector | null> {
  const sectorCache = cache ?? getSectorCache(supabase);
  await sectorCache.reload();

  const explicitCode = normalizeSectorCode(input.code);
  const name = String(input.name ?? "").trim();
  const parsed = name ? parseSectorText(name) : { code: null, name: "" };
  const code = explicitCode ?? normalizeSectorCode(parsed.code);
  const displayName = name ? parsed.name || name : "";

  if (code) {
    const byCode = sectorCache.getByCode(code);
    if (byCode) {
      return { id: byCode.id, code: byCode.code!, name: byCode.name };
    }
  }

  if (displayName) {
    const byName = sectorCache.getByName(displayName);
    if (byName) {
      const resolvedCode = byName.code ?? code ?? slugSectorCodeFromName(displayName);
      if (!byName.code && resolvedCode) {
        await supabase.from("sectors").update({ code: resolvedCode }).eq("id", byName.id);
        sectorCache.remember({ ...byName, code: resolvedCode });
      }
      return { id: byName.id, code: resolvedCode, name: byName.name };
    }
  }

  if (input.create === false) return null;

  const finalName = displayName || (code ? `Setor ${code}` : "");
  if (!finalName) return null;

  const finalCode = code ?? slugSectorCodeFromName(finalName);
  const budget = Number.isFinite(Number(input.budget_limit)) ? Number(input.budget_limit) : 0;

  const { data: created, error } = await supabase
    .from("sectors")
    .insert({ name: finalName, code: finalCode, budget_limit: budget, active: true })
    .select("id, name, code")
    .single();

  if (error) {
    if (String(error.message || "").toLowerCase().includes("unique") && finalCode) {
      const retry = sectorCache.getByCode(finalCode);
      if (retry) return { id: retry.id, code: retry.code!, name: retry.name };
    }
    console.error("Falha ao criar setor:", finalName, finalCode, error);
    return null;
  }

  const sector: SectorRow = {
    id: Number(created.id),
    name: String(created.name),
    code: normalizeSectorCode(created.code) ?? finalCode,
  };
  sectorCache.remember(sector);
  return { id: sector.id, code: sector.code!, name: sector.name };
}

/** Atalho: resolve setor por código com nome opcional para criação. */
export async function resolveSectorByCode(
  supabase: SupabaseClient,
  code: string | number,
  name?: string | null,
  cache?: SectorCache
): Promise<ResolvedSector | null> {
  return resolveSector(supabase, { code, name, create: true }, cache);
}

/** Atalho: resolve setor por nome (fallback legado). */
export async function resolveSectorByName(
  supabase: SupabaseClient,
  name: string,
  cache?: SectorCache
): Promise<ResolvedSector | null> {
  return resolveSector(supabase, { name, create: true }, cache);
}
