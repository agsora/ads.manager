import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { logActivity, q } from "@/lib/db";
import { fetchMetrics, platformOf } from "@/lib/social";
import { refreshContentMetrics } from "@/lib/metrics-sync";

export const maxDuration = 60;

/**
 * POST { url }  → just read the numbers (the form fills itself)
 * POST { ids }  → read & save for those content rows
 */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const b = (await req.json()) as { url?: string; ids?: number[] };
  if (b.url) {
    if (!platformOf(b.url)) throw new HttpError(400, "Link harus dari TikTok, YouTube, Instagram, atau Facebook");
    return NextResponse.json(await fetchMetrics(b.url));
  }
  if (!b.ids?.length) throw new HttpError(400, "Pilih konten atau isi link terlebih dahulu");
  const rows = await q<{ id: number }>(`SELECT id FROM content_plans WHERE org_id = $1 AND id = ANY($2::int[])`, [s.org, b.ids.map(Number)]);
  const res = await refreshContentMetrics(s.org, rows.map((r) => r.id).slice(0, 25));
  await logActivity(s.org, s.name, "Tarik metrik dari link", `${res.updated} diperbarui, ${res.failed.length} gagal`);
  return NextResponse.json(res);
});
