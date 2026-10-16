import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyKey } from "./companies.js";
import { EMPRESA_SCOPED_TABLES } from "./empresaScope.js";

/** Empresa ativa do request HTTP (propagada em async). */
export const empresaAls = new AsyncLocalStorage<CompanyKey>();

const stampEmpresa = (payload: any, key: CompanyKey): any => {
  if (Array.isArray(payload)) {
    return payload.map((row) =>
      row && typeof row === "object" ? { ...row, empresa_key: row.empresa_key ?? key } : row
    );
  }
  if (payload && typeof payload === "object") {
    return { ...payload, empresa_key: payload.empresa_key ?? key };
  }
  return payload;
};

/**
 * Envolve supabase.from para auto-aplicar empresa_key em tabelas scoped
 * quando houver contexto de request (ALS).
 */
export function installEmpresaScopedSupabase(client: SupabaseClient): void {
  const anyClient = client as any;
  if (anyClient.__empresaScopedInstalled) return;
  anyClient.__empresaScopedInstalled = true;

  const originalFrom = client.from.bind(client);

  anyClient.from = (table: string) => {
    const base = originalFrom(table);
    const key = empresaAls.getStore();
    if (!key || !EMPRESA_SCOPED_TABLES.has(table)) return base;

    return new Proxy(base, {
      get(target, prop, receiver) {
        if (prop === "select") {
          return (columns?: any, options?: any) =>
            target.select(columns, options).eq("empresa_key", key);
        }
        if (prop === "insert") {
          return (payload: any, options?: any) => target.insert(stampEmpresa(payload, key), options);
        }
        if (prop === "upsert") {
          return (payload: any, options?: any) => target.upsert(stampEmpresa(payload, key), options);
        }
        if (prop === "update") {
          return (payload: any, options?: any) =>
            target.update(payload, options).eq("empresa_key", key);
        }
        if (prop === "delete") {
          return () => target.delete().eq("empresa_key", key);
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  };
}
