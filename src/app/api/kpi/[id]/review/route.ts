import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { logActivity, q } from "@/lib/db";
import { loadKpiScorecards } from "@/lib/kpi-scorecard-repo";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(["owner", "admin"]);
  const id = Number((await ctx.params).id);
  const { action } = await req.json();
  if (!["lock", "unlock"].includes(action)) throw new HttpError(400, "Aksi tidak dikenal");
  if (action === "unlock") {
    const rows = await q(`UPDATE kpi_targets SET review_locked=false, review_snapshot=NULL, reviewed_at=NULL, reviewed_by=NULL, updated_at=now() WHERE org_id=$1 AND id=$2 RETURNING id`, [s.org, id]);
    if (!rows.length) throw new HttpError(404, "KPI tidak ditemukan");
  } else {
    const card = (await loadKpiScorecards(s.org)).find((c) => c.row.id === id);
    if (!card) throw new HttpError(404, "KPI tidak ditemukan");
    const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).slice(0, 7);
    if (card.month >= month) throw new HttpError(400, "Evaluasi dapat dikunci setelah bulan KPI berakhir");
    if (card.score === null) throw new HttpError(400, "Lengkapi data seluruh indikator sebelum mengunci evaluasi");
    const rows = await q(`UPDATE kpi_targets SET review_locked=true, review_snapshot=$3::jsonb, reviewed_at=now(), reviewed_by=$4, updated_at=now()
      WHERE org_id=$1 AND id=$2 AND review_locked=false AND updated_at=$5::timestamptz RETURNING id`,
    [s.org, id, JSON.stringify(card), s.name, card.row.updated_at]);
    if (!rows.length) throw new HttpError(409, "KPI telah berubah atau sudah terkunci. Perbarui halaman.");
  }
  await logActivity(s.org, s.name, action === "lock" ? "Kunci evaluasi KPI" : "Buka evaluasi KPI", `id ${id}`);
  return NextResponse.json({ ok: true });
});
