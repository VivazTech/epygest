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
  const { data: before, error } = await sb
    .from("crds")
    .select("id, code, name, active, empresa_key")
    .eq("code", "630");

  if (error) {
    console.error(error);
    process.exit(1);
  }
  if (!before?.length) {
    console.error("CRD 630 não encontrado");
    process.exit(1);
  }
  console.log("before", JSON.stringify(before, null, 2));

  for (const row of before) {
    const { error: updErr } = await sb.from("crds").update({ name: "Swile" }).eq("id", row.id);
    if (updErr) {
      console.error(updErr);
      process.exit(1);
    }
  }

  const { data: after } = await sb
    .from("crds")
    .select("id, code, name, active, empresa_key")
    .eq("code", "630");
  console.log("after", JSON.stringify(after, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
