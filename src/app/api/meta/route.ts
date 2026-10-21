import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth";
import { getBrands, getOptions } from "@/lib/repo";
import { q } from "@/lib/db";

export const GET = handle(async () => {
  const s = await requireSession();
  const [brands, options, users] = await Promise.all([
    getBrands(s.org),
    getOptions(s.org),
    q<{ id: number; name: string }>(`SELECT id, name FROM users WHERE org_id = $1 ORDER BY name`, [s.org]),
  ]);
  const campaigns = await q<{ name: string }>(
    `SELECT name FROM (
       SELECT DISTINCT campaign_name AS name FROM ad_campaigns WHERE org_id = $1 AND campaign_name IS NOT NULL AND start_date >= now() - interval '240 days'
       UNION SELECT DISTINCT campaign_name FROM wa_blasts WHERE org_id = $1 AND campaign_name IS NOT NULL
       UNION SELECT DISTINCT batch FROM blast_contacts WHERE org_id = $1 AND batch IS NOT NULL
     ) t ORDER BY name LIMIT 200`,
    [s.org],
  );
  return NextResponse.json({ session: s, brands, options, users, campaigns: campaigns.map((c) => c.name) });
});
