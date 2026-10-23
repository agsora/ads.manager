import ExcelJS from "exceljs";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { getResource, RESOURCES } from "@/lib/resources";
import { listRows } from "@/lib/repo";
import { addResourceSheet, toBuffer, toCSV } from "@/lib/excel";
import { todayISO } from "@/lib/format";

export const maxDuration = 60;

export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const u = new URL(req.url);
  const key = u.searchParams.get("resource") || "all";
  if (key === "all" && s.role === "staff") throw new HttpError(403, "Backup seluruh data hanya untuk owner/admin");
  const format = u.searchParams.get("format") || "xlsx";
  const filter = { from: u.searchParams.get("from"), to: u.searchParams.get("to"), brand: u.searchParams.get("brand"), limit: 20000 };
  const stamp = todayISO();

  if (key === "all") {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Ads Manager";
    for (const r of RESOURCES) addResourceSheet(wb, r, await listRows(s.org, r, filter), { computed: false });
    return new Response(await toBuffer(wb), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="backup-marketing-${stamp}.xlsx"`,
      },
    });
  }
  const r = getResource(key);
  if (!r) throw new HttpError(404, "Modul tidak ditemukan");
  const rows = await listRows(s.org, r, filter);
  if (format === "csv")
    return new Response(toCSV(r, rows), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${r.key}-${stamp}.csv"` },
    });
  const wb = new ExcelJS.Workbook();
  addResourceSheet(wb, r, rows);
  return new Response(await toBuffer(wb), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${r.key}-${stamp}.xlsx"`,
    },
  });
});
