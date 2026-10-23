import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { logActivity, q } from "@/lib/db";
import { todayISO } from "@/lib/format";

const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * POST { ids } → for each creative with a campaign name, fill biaya / impresi / klik from the Ads Campaign rows
 * of that campaign (within the creative's run dates) and leads / deal from WhatsApp leads carrying the same campaign code.
 */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const b = (await req.json()) as { ids?: number[] };
  if (!b.ids?.length) throw new HttpError(400, "Pilih kreatif terlebih dahulu");
  const rows = await q<{ id: number; campaign: string | null; brand: string | null; start_date: string; end_date: string | null }>(
    `SELECT id, campaign, brand, start_date::text, end_date::text FROM ad_creatives WHERE org_id = $1 AND id = ANY($2::int[])`,
    [s.org, b.ids.map(Number)],
  );
  let updated = 0;
  const skipped: string[] = [];
  for (const c of rows) {
    if (!c.campaign) {
      skipped.push(`#${c.id} (belum ada campaign)`);
      continue;
    }
    const from = c.start_date;
    const to = c.end_date ?? todayISO();
    const ads = await q<{ spend: string; impressions: string; clicks: string }>(
      `SELECT COALESCE(SUM(spend),0) spend, COALESCE(SUM(impressions),0) impressions, COALESCE(SUM(clicks),0) clicks
         FROM ad_campaigns WHERE org_id = $1 AND campaign_name ILIKE $2 AND ($3::text IS NULL OR brand = $3) AND start_date BETWEEN $4 AND $5`,
      [s.org, `%${c.campaign.trim()}%`, c.brand, from, to],
    );
    const leadRows = await q<{ campaign_ref: string; final_status: string | null }>(
      `SELECT campaign_ref, final_status FROM leads WHERE org_id = $1 AND campaign_ref IS NOT NULL AND chat_date BETWEEN $2 AND $3`,
      [s.org, from, to],
    );
    const key = norm(c.campaign);
    const mine = leadRows.filter((l) => {
      const k = norm(l.campaign_ref);
      return k && (k === key || (k.length >= 4 && key.length >= 4 && (k.includes(key) || key.includes(k))));
    });
    const a = ads[0];
    await q(`UPDATE ad_creatives SET spend = $1, impressions = $2, clicks = $3, leads = $4, deals = $5, updated_at = now() WHERE id = $6 AND org_id = $7`, [
      Number(a.spend), Number(a.impressions), Number(a.clicks), mine.length, mine.filter((l) => String(l.final_status ?? "").toLowerCase() === "deal").length, c.id, s.org,
    ]);
    updated++;
  }
  await logActivity(s.org, s.name, "Tarik hasil kreatif dari campaign", `${updated} diperbarui`);
  return NextResponse.json({ updated, skipped });
});
