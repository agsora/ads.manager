import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth";
import { loadKpiScorecards } from "@/lib/kpi-scorecard-repo";

export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const brand = new URL(req.url).searchParams.get("brand");
  return NextResponse.json({ scorecards: await loadKpiScorecards(s.org, { brand }) });
});
