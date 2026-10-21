import { q } from "./db";
import { fetchMetrics, platformOf } from "./social";

const COLS = ["reach", "views", "likes", "comments", "shares", "saves"] as const;

/** Reads each row's post link (or brief link if it is a social link) and saves the numbers that were found. */
export async function refreshContentMetrics(orgId: number, ids: number[]) {
  const rows = await q<Record<string, unknown>>(`SELECT id, title, post_link, brief_link FROM content_plans WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, ids]);
  let updated = 0;
  const failed: { id: number; title: string; message: string }[] = [];
  for (const r of rows) {
    const url = [r.post_link, r.brief_link].map(String).find((u) => platformOf(u));
    if (!url) {
      failed.push({ id: Number(r.id), title: String(r.title ?? ""), message: "Tidak ada link postingan (TikTok/YouTube/Instagram)" });
      continue;
    }
    const m = await fetchMetrics(url);
    if (!m.ok) {
      failed.push({ id: Number(r.id), title: String(r.title ?? ""), message: m.message ?? "Gagal" });
      continue;
    }
    const keys = COLS.filter((k) => m.metrics[k] !== undefined);
    await q(`UPDATE content_plans SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(", ")}, updated_at = now() WHERE org_id = $1 AND id = $2`, [orgId, Number(r.id), ...keys.map((k) => m.metrics[k])]);
    updated++;
  }
  return { updated, failed };
}
