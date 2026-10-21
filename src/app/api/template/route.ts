import ExcelJS from "exceljs";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { getResource } from "@/lib/resources";
import { getOptions } from "@/lib/repo";
import { addResourceSheet, addTableSheet, toBuffer } from "@/lib/excel";

export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const r = getResource(new URL(req.url).searchParams.get("resource") ?? "");
  if (!r) throw new HttpError(404, "Modul tidak ditemukan");
  const options = await getOptions(s.org);
  const wb = new ExcelJS.Workbook();
  const ws = addResourceSheet(wb, r, [], { computed: false });
  // dropdown validation for select columns
  r.fields.forEach((f, i) => {
    if (f.type === "select" && f.options && options[f.options]) {
      const list = options[f.options].join(",");
      if (list.length < 250)
        for (let row = 2; row <= 500; row++)
          ws.getCell(row, i + 1).dataValidation = { type: "list", allowBlank: true, formulae: [`"${list}"`] };
    }
  });
  addTableSheet(
    wb,
    "Petunjuk",
    [
      { header: "Kolom", key: "label", width: 28 },
      { header: "Tipe", key: "type", width: 12 },
      { header: "Wajib", key: "req", width: 8 },
      { header: "Pilihan / Format", key: "hint", width: 80 },
    ],
    r.fields.map((f) => ({
      label: f.label,
      type: f.type,
      req: f.required ? "Ya" : "",
      hint:
        f.type === "select" && f.options ? (options[f.options] ?? []).join(", ")
        : f.type === "date" ? "Tanggal (dd/mm/yyyy atau yyyy-mm-dd)"
        : f.type === "money" ? "Angka rupiah tanpa titik, mis. 150000"
        : f.type === "percent" ? "Persen, mis. 2.5 untuk 2,5%"
        : f.type === "rating" ? "1 - 5"
        : "",
    })),
  );
  return new Response(await toBuffer(wb), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="template-${r.key}.xlsx"`,
    },
  });
});
