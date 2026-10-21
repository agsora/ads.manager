import { handle, requireSession } from "@/lib/auth";
import { toBuffer } from "@/lib/excel";
import { monthEnd, monthStart, todayISO } from "@/lib/format";
import { buildReportWorkbook } from "@/lib/report";

export const maxDuration = 60;

export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const u = new URL(req.url);
  const t = todayISO();
  const from = u.searchParams.get("from") || monthStart(t);
  const to = u.searchParams.get("to") || monthEnd(t);
  const { wb } = await buildReportWorkbook(s.org, from, to, u.searchParams.get("brand"));
  return new Response(await toBuffer(wb), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="laporan-marketing-${from}_${to}.xlsx"`,
    },
  });
});
