import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { ensureSchema, sql } = await import("../src/lib/db");
  await ensureSchema();
  const t = (await sql().query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1`)) as { table_name: string }[];
  console.log("Schema OK:", t.map((x) => x.table_name).join(", "));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
