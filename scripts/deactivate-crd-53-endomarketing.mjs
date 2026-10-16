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
  const { data: targets, error } = await sb
    .from("crds")
    .select("id, code, name, sector_id, active, empresa_key")
    .eq("code", "53")
    .ilike("name", "%ENDOMARKETING%");

  if (error) {
    console.error(error);
    process.exit(1);
  }
  if (!targets?.length) {
    console.log("Nenhum CRD 53 ENDOMARKETING ativo/encontrado.");
    return;
  }

  for (const row of targets) {
    const { error: updErr } = await sb
      .from("crds")
      .update({ active: false })
      .eq("id", row.id);
    if (updErr) {
      console.error("falha ao desativar", row.id, updErr);
      process.exit(1);
    }
    console.log("desativado", row);
  }

  const { data: after } = await sb
    .from("crds")
    .select("id, code, name, active, empresa_key")
    .or("code.eq.53,code.eq.603")
    .order("code");
  console.log("after", JSON.stringify(after, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
