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
  const { data, error } = await sb
    .from("crds")
    .select("id, code, name, sector_id, active, empresa_key")
    .or("code.eq.53,code.eq.603,name.ilike.%ENDOMARKETING%");

  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log("found", JSON.stringify(data, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
