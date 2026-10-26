import { getSetting, q, setSetting } from "./db";
import { addDays, diffDays, fmtDate, fmtNum } from "./format";
import { refreshContentMetrics } from "./metrics-sync";
import { notify, orgUsers } from "./notify";
import type { Row } from "./resources";

/** A posted content gets a performance check every 7 days after it went live, up to this many times (8 × 7 = 56 days). */
export const MAX_CHECKS = 8;

export interface DueCheck {
  id: number;
  title: string;
  days: number;
  line: string;
}

/**
 * For every posted content that reached a new 7-day mark since it was posted (day 7, 14, 21 …), notify the person who
 * entered it to look at followers, reach, likes and comments. One notification per content, so five contents posted on
 * different days produce five reminders over the following weeks. The last mark sent is remembered per content, so a
 * missed morning is caught up and a manual re-run never sends the same reminder twice.
 */
export async function runContentChecks(orgId: number, today: string): Promise<{ sent: number; due: DueCheck[] }> {
  const rows = await q<Row>(
    `SELECT * FROM content_plans WHERE org_id = $1 AND status = 'Posted' AND COALESCE(actual_date, post_date) BETWEEN $2 AND $3`,
    [orgId, addDays(today, -(MAX_CHECKS * 7 + 6)), addDays(today, -7)],
  );
  const due: { row: Row; days: number; milestone: number }[] = [];
  for (const r of rows) {
    const base = String(r.actual_date ?? r.post_date).slice(0, 10);
    const days = diffDays(base, today);
    const milestone = Math.floor(days / 7);
    if (milestone < 1 || milestone > MAX_CHECKS) continue;
    if (milestone <= (Number(await getSetting(`pc:${r.id}`)) || 0)) continue;
    due.push({ row: r, days, milestone });
  }
  if (!due.length) return { sent: 0, due: [] };

  // pull fresh numbers from the post links first, so the reminder already shows today's figures
  const withLink = due.filter((d) => d.row.post_link || d.row.brief_link).slice(0, 25).map((d) => Number(d.row.id));
  if (withLink.length) {
    await refreshContentMetrics(orgId, withLink).catch(() => null);
    const fresh = await q<Row>(`SELECT * FROM content_plans WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, withLink]);
    for (const d of due) d.row = fresh.find((f) => f.id === d.row.id) ?? d.row;
  }

  const users = await orgUsers(orgId);
  const managers = users.filter((u) => u.role === "owner" || u.role === "admin" || u.role === "superadmin").map((u) => u.id);
  const result: DueCheck[] = [];
  for (const { row: r, days, milestone } of due) {
    // the person who entered it; older rows without that fall back to the PIC's name, then to the managers
    const byId = r.created_by ? users.find((u) => u.id === Number(r.created_by)) : undefined;
    const byPic = !byId && r.pic ? users.find((u) => u.name.trim().toLowerCase() === String(r.pic).trim().toLowerCase()) : undefined;
    const to = byId ? [byId.id] : byPic ? [byPic.id] : managers;
    const num = (v: unknown) => (v === null || v === undefined || v === "" || Number(v) === 0 ? "–" : fmtNum(Number(v)));
    const empty = !Number(r.reach) && !Number(r.likes) && !Number(r.comments) && !Number(r.views) && !Number(r.followers);
    const figures = `Reach ${num(r.reach)} · Views ${num(r.views)} · Like ${num(r.likes)} · Comment ${num(r.comments)} · Followers saat posting ${num(r.followers)}`;
    const base = String(r.actual_date ?? r.post_date).slice(0, 10);
    const line = `${r.title} (${r.channel ?? "-"}, tayang ${fmtDate(base)}) — ${empty ? "hasil belum diisi" : figures}`;
    await notify({
      orgId,
      category: "content",
      title: `Cek performa konten (hari ke-${days}): ${r.title}`,
      body: `Tayang ${fmtDate(base)} di ${r.channel ?? "-"}. ${empty ? "Hasil belum diisi: buka Content Plan → Hasil, isi followers, reach, like, dan comment (atau tempel link postingan agar terisi otomatis)." : `Sekarang: ${figures}. Perbarui angkanya di Content Plan → Hasil bila sudah berubah.`}`,
      link: "/content",
      userIds: to,
      skipActor: false,
    });
    await setSetting(`pc:${r.id}`, String(milestone));
    result.push({ id: Number(r.id), title: String(r.title), days, line });
  }
  return { sent: result.length, due: result };
}
