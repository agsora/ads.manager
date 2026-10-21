import { q } from "./db";
import { folderFor } from "./drive";
import type { Row } from "./resources";

const TABLES: Record<string, string> = {
  content: "content_plans",
  ads: "ad_campaigns",
  influencers: "influencer_campaigns",
  contacts: "blast_contacts",
  events: "marketing_events",
};

export const driveResources = Object.keys(TABLES);

/** Loads the record a file belongs to (scoped to the workspace) and resolves its Drive folder. */
export async function resolveTarget(orgId: number, resource: string, id: number) {
  const table = TABLES[resource];
  if (!table) throw new Error("Modul ini tidak mendukung file");
  const [row] = await q<Row>(`SELECT * FROM ${table} WHERE org_id = $1 AND id = $2`, [orgId, id]);
  if (!row) throw new Error("Data tidak ditemukan");
  return { row, ...folderFor(resource, row) };
}
