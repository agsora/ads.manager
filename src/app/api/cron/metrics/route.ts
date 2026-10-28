import { NextResponse } from "next/server";
import { handle, HttpError } from "@/lib/auth";
import { q } from "@/lib/db";
import { addDays, todayISO } from "@/lib/format";
import { MAX_CHECKS } from "@/lib/content-checks";
import { refreshContentMetrics } from "@/lib/metrics-sync";
import { syncFollowers } from "@/lib/followers-sync";
import { syncMetaAds } from "@/lib/meta-ads";

export const maxDuration = 60;

/** Vercel Cron (daily 23:00 UTC = 06:00 WIB). Reads every posted content's link today's followers of each Instagram account, and the last 7 days of Meta Ads; the least recently updated go first. */
export const GET = handle(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "Unauthorized");
  const since = addDays(todayISO(), -(MAX_CHECKS * 7 + 7));
  const orgs = await q<{ id: number }>(`SELECT DISTINCT org_id AS id FROM users`);
  const results = await Promise.all(
    orgs.map(async (o) => {
      try {
        const followers = await syncFollowers(o.id).catch((e) => ({ updated: 0, errors: [(e as Error).message] }));
        const ads = await syncMetaAds(o.id, 7).catch((e) => ({ inserted: 0, updated: 0, errors: [(e as Error).message] }));
        const rows = await q<{ id: number }>(
          `SELECT id FROM content_plans WHERE org_id = $1 AND status = 'Posted' AND COALESCE(actual_date, post_date) >= $2 AND (post_link IS NOT NULL OR brief_link IS NOT NULL) ORDER BY metrics_at NULLS FIRST, post_date DESC LIMIT 60`,
          [o.id, since],
        );
        const r = rows.length ? await refreshContentMetrics(o.id, rows.map((x) => Number(x.id))) : { updated: 0, failed: [] };
        return { orgId: o.id, checked: rows.length, updated: r.updated, failed: r.failed.length, followers: followers.updated, followerErrors: followers.errors.length, ads: ads.inserted + ads.updated, adErrors: ads.errors.length };
      } catch (e) {
        return { orgId: o.id, error: (e as Error).message };
      }
    }),
  );
  return NextResponse.json({ ok: true, results });
});
