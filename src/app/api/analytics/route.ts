import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth";
import { buildAnalytics } from "@/lib/analytics";
import { monthEnd, monthStart, todayISO } from "@/lib/format";

export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const u = new URL(req.url);
  const t = todayISO();
  const from = u.searchParams.get("from") || monthStart(t);
  const to = u.searchParams.get("to") || monthEnd(t);
  const data = await buildAnalytics(s.org, { from, to, brand: u.searchParams.get("brand") });
  return NextResponse.json(data);
});
