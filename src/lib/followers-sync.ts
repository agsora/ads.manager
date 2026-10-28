import { q } from "./db";
import { todayISO } from "./format";
import { igFollowers } from "./social";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Reads today's follower count of every connected Instagram account and saves it as that day's snapshot
 * (replacing an earlier snapshot of the same day). The brand is found by matching the account's username or
 * profile name with the workspace's brands; IG_BRAND_<NAME> in the environment overrides it.
 */
export async function syncFollowers(orgId: number) {
  const today = todayISO();
  const brands = (await q<{ name: string }>(`SELECT name FROM brands WHERE org_id = $1`, [orgId])).map((b) => b.name);
  const results: { brand: string; followers: number }[] = [];
  const errors: string[] = [];
  for (const a of await igFollowers()) {
    if (a.error) {
      errors.push(a.error);
      continue;
    }
    const keys = [a.username, a.displayName].map(norm).filter(Boolean);
    const brand = a.brand || brands.find((b) => keys.some((k) => k === norm(b) || k.includes(norm(b)) || norm(b).includes(k))) || a.displayName || a.username;
    const upd = await q(`UPDATE follower_snapshots SET followers = $4, notes = 'Otomatis dari Instagram', updated_at = now() WHERE org_id = $1 AND brand = $2 AND channel = 'Instagram' AND snapshot_date = $3 RETURNING id`, [orgId, brand, today, a.followers]);
    if (!upd.length) await q(`INSERT INTO follower_snapshots (org_id, snapshot_date, brand, channel, followers, notes) VALUES ($1, $2, $3, 'Instagram', $4, 'Otomatis dari Instagram')`, [orgId, today, brand, a.followers]);
    results.push({ brand, followers: a.followers });
  }
  return { updated: results.length, results, errors, at: new Date().toISOString() };
}
