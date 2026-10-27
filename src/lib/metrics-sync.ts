import { q } from "./db";
import { fetchMetrics, platformOf } from "./social";

const COLS = ["reach", "views", "likes", "comments", "shares", "saves"] as const;
const PARALLEL = 5;

/** Reads each row's post link (or brief link if it is a social link) and saves the numbers that were found, with the time of the update. */
export async function refreshContentMetrics(orgId: number, ids: number[]) {
  const rows = await q<Record<string, unknown>>(`SELECT id, title, post_link, brief_link FROM content_plans WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, ids]);
  let updated = 0;
  const failed: { id: number; title: string; message: string }[] = [];
  const one = async (r: Record<string, unknown>) => {
    const id = Number(r.id);
    const title = String(r.title ?? "");
    const fail = async (message: string) => {
      failed.push({ id, title, message });
      await q(`UPDATE content_plans SET metrics_note = $3 WHERE org_id = $1 AND id = $2`, [orgId, id, message.slice(0, 300)]);
    };
    const url = [r.post_link, r.brief_link].map(String).find((u) => platformOf(u));
    if (!url) return fail("Tidak ada link postingan (TikTok/YouTube/Instagram)");
    const m = await fetchMetrics(url);
    if (!m.ok) return fail(m.message ?? "Gagal");
    const keys = COLS.filter((k) => m.metrics[k] !== undefined);
    await q(`UPDATE content_plans SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(", ")}${keys.length ? ", " : ""}metrics_at = now(), metrics_note = NULL, updated_at = now() WHERE org_id = $1 AND id = $2`, [orgId, id, ...keys.map((k) => m.metrics[k])]);
    updated++;
  };
  // a few links at a time, so a long list still fits in one function run
  for (let i = 0; i < rows.length; i += PARALLEL) await Promise.all(rows.slice(i, i + PARALLEL).map((r) => one(r).catch((e) => { failed.push({ id: Number(r.id), title: String(r.title ?? ""), message: (e as Error).message }); })));
  return { updated, failed };
}
