import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { buildAnalytics } from "@/lib/analytics";
import { monthEnd, monthStart, todayISO } from "@/lib/format";

export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const u = new URL(req.url);
  const t = todayISO();
  let from = u.searchParams.get("from") || monthStart(t);
  let to = u.searchParams.get("to") || monthEnd(t);
  const ok = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d + "T00:00:00Z").getTime());
  if (!ok(from) || !ok(to)) throw new HttpError(400, "Rentang tanggal tidak valid");
  if (from > to) [from, to] = [to, from];
  const data = await buildAnalytics(s.org, { from, to, brand: u.searchParams.get("brand") });
  return NextResponse.json(data);
});
