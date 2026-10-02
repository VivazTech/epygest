import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("missing supabase env");
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data: existing, error } = await sb
    .from("crds")
    .select("id, code, name, sector_id, natureza, active, empresa_key")
    .in("code", ["481", "4812"]);

  if (error) {
    console.error("query error", error);
    process.exit(1);
  }
  console.log("before", JSON.stringify(existing, null, 2));

  const sources = (existing || []).filter((r) => String(r.code).trim() === "481");
  if (!sources.length) {
    console.error("CRD 481 não encontrado. Cadastre o 481 antes de dividir.");
    process.exit(1);
  }

  for (const c of sources) {
    const { error: updErr } = await sb
      .from("crds")
      .update({ name: "UNIFORMES E EPIS - FOLHA DE PAGAMENTO" })
      .eq("id", c.id);
    if (updErr) {
      console.error("update 481 failed", updErr);
      process.exit(1);
    }

    const already = (existing || []).some(
      (r) =>
        String(r.code).trim() === "4812" &&
        Number(r.sector_id) === Number(c.sector_id) &&
        String(r.empresa_key || "vivaz") === String(c.empresa_key || "vivaz")
    );
    if (already) {
      console.log("4812 já existe para sector", c.sector_id, c.empresa_key);
      continue;
    }

    const payload = {
      natureza: c.natureza || "O",
      code: "4812",
      name: "UNIFORMES E EPIS - EXTRAS",
      sector_id: c.sector_id,
      saldo_anterior: 0,
      previsto_mes: 0,
      disponivel_mes: 0,
      realizado_mes: 0,
      saldo: 0,
      active: true,
      empresa_key: c.empresa_key || "vivaz",
    };

    const { data: inserted, error: insErr } = await sb.from("crds").insert(payload).select("id, code, name").single();
    if (insErr) {
      console.error("insert 4812 failed", insErr);
      process.exit(1);
    }
    console.log("created", inserted);
  }

  const { data: after } = await sb
    .from("crds")
    .select("id, code, name, sector_id, empresa_key, active")
    .in("code", ["481", "4812"])
    .order("code");
  console.log("after", JSON.stringify(after, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
