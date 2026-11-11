import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth";
import { loadContentKpiProgress } from "@/lib/kpi-content-repo";

export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const brand = new URL(req.url).searchParams.get("brand");
  return NextResponse.json({ rows: await loadContentKpiProgress(s.org, { brand }) });
});
