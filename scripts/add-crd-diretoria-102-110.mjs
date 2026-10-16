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

const CRDS = [
  { code: "110", name: "DIRETORIA PARTICULAR SRA. LUIZA" },
  { code: "102", name: "DIRETORIA PARTICULAR" },
];

async function main() {
  const { data: sectors, error: secErr } = await sb
    .from("sectors")
    .select("id, name, empresa_key, active")
    .ilike("name", "%diretoria%");

  if (secErr) {
    console.error("sectors error", secErr);
    process.exit(1);
  }
  console.log("sectors", JSON.stringify(sectors, null, 2));

  const diretoria = (sectors || []).filter(
    (s) =>
      String(s.name || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .includes("diretoria") && s.active !== false
  );

  if (!diretoria.length) {
    console.error("Setor Diretoria não encontrado");
    process.exit(1);
  }

  const { data: existing } = await sb
    .from("crds")
    .select("id, code, name, sector_id, empresa_key, active")
    .in(
      "code",
      CRDS.map((c) => c.code)
    );
  console.log("existing", JSON.stringify(existing, null, 2));

  for (const sector of diretoria) {
    for (const crd of CRDS) {
      const found = (existing || []).find(
        (r) =>
          String(r.code).trim() === crd.code &&
          Number(r.sector_id) === Number(sector.id)
      );
      if (found) {
        const { error: updErr } = await sb
          .from("crds")
          .update({ name: crd.name, active: true })
          .eq("id", found.id);
        if (updErr) {
          console.error("update failed", crd.code, sector.id, updErr);
          process.exit(1);
        }
        console.log("updated", { code: crd.code, sector_id: sector.id, id: found.id });
        continue;
      }

      const payload = {
        natureza: "O",
        code: crd.code,
        name: crd.name,
        sector_id: sector.id,
        saldo_anterior: 0,
        previsto_mes: 0,
        disponivel_mes: 0,
        realizado_mes: 0,
        saldo: 0,
        active: true,
        empresa_key: sector.empresa_key || "vivaz",
      };

      const { data: inserted, error: insErr } = await sb
        .from("crds")
        .insert(payload)
        .select("id, code, name, sector_id, empresa_key")
        .single();
      if (insErr) {
        console.error("insert failed", crd.code, sector.id, insErr);
        process.exit(1);
      }
      console.log("created", inserted);
    }
  }

  const { data: after } = await sb
    .from("crds")
    .select("id, code, name, sector_id, empresa_key, active")
    .in(
      "code",
      CRDS.map((c) => c.code)
    )
    .order("code");
  console.log("after", JSON.stringify(after, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
