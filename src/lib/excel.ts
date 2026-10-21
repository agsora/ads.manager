import ExcelJS from "exceljs";
import { RESOURCES, type Resource, type Row } from "./resources";
import { applyDerive, cleanInput } from "./repo";
import { toNumber, toISODate } from "./coerce";

export interface Sheet {
  name: string;
  rows: unknown[][];
}

const norm = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[⭐★*]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function cellValue(c: ExcelJS.Cell): unknown {
  const v = c.value as unknown;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as Record<string, unknown>;
    if ("result" in o) return o.result instanceof Date ? o.result : (o.result as unknown);
    if ("richText" in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("hyperlink" in o) return (o.text as string) && !String(o.text).startsWith("http") ? o.hyperlink : o.text ?? o.hyperlink;
    if ("error" in o) return null;
    if ("sharedFormula" in o || "formula" in o) return null;
  }
  return v;
}

function parseCSV(text: string): unknown[][] {
  const delim = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: unknown[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else cur += ch;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

export async function readWorkbook(buf: ArrayBuffer, filename: string): Promise<Sheet[]> {
  if (/\.csv$/i.test(filename)) {
    const text = new TextDecoder("utf-8").decode(buf).replace(/^﻿/, "");
    return [{ name: filename.replace(/\.csv$/i, ""), rows: parseCSV(text) }];
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const sheets: Sheet[] = [];
  wb.eachSheet((ws) => {
    const rows: unknown[][] = [];
    ws.eachRow({ includeEmpty: true }, (r, rn) => {
      const arr: unknown[] = [];
      r.eachCell({ includeEmpty: true }, (c, cn) => {
        arr[cn - 1] = cellValue(c);
      });
      rows[rn - 1] = arr;
    });
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    sheets.push({ name: ws.name, rows });
  });
  return sheets;
}

/** Map column index -> field key by matching header text against labels/aliases. */
function matchHeader(r: Resource, header: unknown[]) {
  const best = new Map<string, { col: number; score: number }>();
  header.forEach((h, col) => {
    const t = norm(h);
    if (!t) return;
    for (const f of r.fields) {
      let score = 0;
      if (t === norm(f.label) || t === f.key) score = 3;
      else if ((f.aliases ?? []).some((a) => norm(a) === t)) score = 2;
      else if (norm(f.label).length > 4 && (t.startsWith(norm(f.label)) || (f.aliases ?? []).some((a) => norm(a).length > 5 && t.startsWith(norm(a))))) score = 1;
      if (!score) continue;
      const prev = best.get(f.key);
      if (!prev || score > prev.score) best.set(f.key, { col, score });
    }
  });
  return best;
}

export interface ParsedSheet {
  sheet: string;
  resource: Resource;
  rows: Record<string, unknown>[];
  skipped: number;
  matched: string[];
}

export function parseSheet(sheet: Sheet, r: Resource, defaultBrand?: string | null, defaultPlatform?: string | null): ParsedSheet | null {
  // find best header row in first 15 rows
  let headerIdx = -1;
  let bestMap = new Map<string, { col: number; score: number }>();
  for (let i = 0; i < Math.min(15, sheet.rows.length); i++) {
    const m = matchHeader(r, sheet.rows[i] ?? []);
    if (m.size > bestMap.size) {
      bestMap = m;
      headerIdx = i;
    }
  }
  if (headerIdx < 0 || bestMap.size < 2) return null;
  // two-row header support: sub-headers (e.g. "Mulai"/"Berakhir", "Follow up 1") in the next row
  let dataStart = headerIdx + 1;
  const sub = matchHeader(r, sheet.rows[headerIdx + 1] ?? []);
  const usedCols = new Set([...bestMap.values()].map((v) => v.col));
  let subUsed = 0;
  for (const [k, v] of sub) {
    const cur = bestMap.get(k);
    if (usedCols.has(v.col) && !(cur && cur.col === v.col)) continue;
    if (!cur || v.score > cur.score) {
      bestMap.set(k, v);
      subUsed++;
    }
  }
  if (subUsed) dataStart++;

  // The Marketing Report template has "Klik tautan" and "CPC" values swapped in practice:
  // clicks are whole numbers, CPC usually has decimals. Detect the CPC column to repair rows.
  const header = sheet.rows[headerIdx] ?? [];
  const cpcCol = r.key === "ads" ? header.findIndex((h) => /^cpc\b/.test(norm(h))) : -1;

  // Slash dates are ambiguous (10/12/2026): Indonesian files are D/M/Y, Meta exports often M/D/Y.
  // Decide per file from the values: a part above 12 settles it; if nothing settles it, assume D/M/Y.
  const dateCols = r.fields.filter((f) => f.type === "date" && bestMap.has(f.key)).map((f) => bestMap.get(f.key)!.col);
  let dmy = 0;
  let mdy = 0;
  for (let i = dataStart; i < sheet.rows.length; i++)
    for (const c of dateCols) {
      const cell = sheet.rows[i]?.[c];
      const m = typeof cell === "string" ? cell.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/) : null;
      if (!m) continue;
      if (+m[1] > 12) dmy++;
      if (+m[2] > 12) mdy++;
    }
  const usDates = mdy > dmy;
  const fixDate = (v: unknown) => {
    if (!usDates || typeof v !== "string") return v;
    const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    return m ? `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : v;
  };

  const out: Record<string, unknown>[] = [];
  let skipped = 0;
  for (let i = dataStart; i < sheet.rows.length; i++) {
    const raw = sheet.rows[i] ?? [];
    const obj: Record<string, unknown> = {};
    for (const [k, v] of bestMap) obj[k] = r.fields.find((f) => f.key === k)?.type === "date" ? fixDate(raw[v.col]) : raw[v.col];
    const clean = cleanInput(r, obj, true);
    if (cpcCol >= 0) {
      const cpcVal = toNumber(raw[cpcCol]);
      const clicks = clean.clicks as number | null;
      if (cpcVal !== null && Number.isInteger(cpcVal) && (clicks === null || !Number.isInteger(clicks))) clean.clicks = cpcVal;
    }
    const hasKey = r.importKeys.some((k) => clean[k] !== null && clean[k] !== undefined && clean[k] !== "");
    if (!hasKey) {
      if (Object.values(clean).some((x) => x !== null && x !== undefined)) skipped++;
      continue;
    }
    if (!clean.brand && r.fields.some((f) => f.key === "brand") && defaultBrand) clean.brand = defaultBrand;
    if (!clean.platform && r.fields.some((f) => f.key === "platform") && defaultPlatform) clean.platform = defaultPlatform;
    // fill required date from another date if missing
    if (!clean[r.dateField]) {
      const alt = r.fields.find((f) => f.type === "date" && clean[f.key]);
      clean[r.dateField] = alt ? clean[alt.key] : new Date().toISOString().slice(0, 10);
    }
    for (const f of r.fields) if (!(f.key in clean)) clean[f.key] = null;
    out.push(applyDerive(r, clean));
  }
  return { sheet: sheet.name, resource: r, rows: out, skipped, matched: [...bestMap.keys()] };
}

/** "Ads Report - Ringkasan" style transposed summary → ad_wallets rows. */
export function parseWalletSummary(sheet: Sheet): Record<string, unknown>[] {
  const rows = sheet.rows;
  const findRow = (label: RegExp) => rows.findIndex((r) => r && label.test(norm(r[0])));
  const opening = findRow(/^saldo awal/);
  if (opening < 0) return [];
  const topup = findRow(/^total top ?up/);
  // platform row = first row above opening with values; brand row = row right above opening
  const brandRow = rows[opening - 1] ?? [];
  const platRow = rows[opening - 2] ?? [];
  const updateCell = rows.flat().find((v) => typeof v === "string" && /update\s*:/i.test(v)) as string | undefined;
  const period = (updateCell && toISODate(updateCell.replace(/.*update\s*:\s*/i, "").replace(/\(.*$/, "").trim())) || new Date().toISOString().slice(0, 10);
  const out: Record<string, unknown>[] = [];
  let platform = "";
  // planned top-ups listed below as "brand | amount"
  const plan = new Map<string, number>();
  const planIdx = rows.findIndex((r) => r && /plan top ?up/.test(norm(r[0])));
  if (planIdx >= 0)
    for (let i = planIdx + 1; i < rows.length && rows[i]?.[0]; i++) plan.set(norm(rows[i][0]), toNumber(rows[i][1]) ?? 0);
  for (let c = 1; c < Math.max(brandRow.length, platRow.length); c++) {
    if (platRow[c]) platform = String(platRow[c]).trim();
    const brand = brandRow[c] ? String(brandRow[c]).trim() : "";
    if (!brand || !platform) continue;
    const plat = /meta|facebook/i.test(platform) ? "Meta" : /tiktok/i.test(platform) ? "TikTok" : platform;
    const planned = [...plan.entries()].find(([k]) => k.includes(norm(brand)) && (plat === "Meta" ? !k.includes("tiktok") : k.includes(norm(plat))));
    out.push({
      period: period.slice(0, 8) + "01",
      brand,
      platform: plat,
      opening_balance: toNumber(rows[opening]?.[c]) ?? 0,
      topup: topup >= 0 ? toNumber(rows[topup]?.[c]) ?? 0 : 0,
      planned_topup: planned ? planned[1] : null,
      notes: `Impor dari sheet "${sheet.name}"`,
    });
  }
  return out;
}

export function guessResource(sheetName: string): Resource | undefined {
  const s = norm(sheetName);
  return RESOURCES.find((r) => r.sheetHints.some((h) => s.includes(h)) || s === r.key || s === norm(r.label));
}

// ------------------------------------------------------------------ export
const ARGB_HEAD = "FF1E293B";

function styleHeader(ws: ExcelJS.Worksheet) {
  const h = ws.getRow(1);
  h.font = { bold: true, color: { argb: "FFFFFFFF" } };
  h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB_HEAD } };
  h.alignment = { vertical: "middle", wrapText: true };
  h.height = 30;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

const numFmt = (t: string) =>
  t === "money" ? '"Rp"#,##0' : t === "percent" ? "0.00%" : t === "decimal" ? "0.00" : t === "number" || t === "rating" ? "#,##0.##" : t === "date" ? "dd/mm/yyyy" : undefined;

export function addResourceSheet(wb: ExcelJS.Workbook, r: Resource, rows: Row[], opts: { computed?: boolean; name?: string } = {}) {
  const ws = wb.addWorksheet((opts.name ?? r.label).slice(0, 31));
  const comp = opts.computed === false ? [] : r.computed ?? [];
  ws.columns = [
    ...r.fields.map((f) => ({ header: f.label, key: f.key, width: f.type === "longtext" ? 40 : f.type === "date" ? 13 : Math.max(12, Math.min(30, f.label.length + 4)), style: { numFmt: numFmt(f.type) } })),
    ...comp.map((c) => ({ header: c.label, key: `__${c.key}`, width: 14, style: { numFmt: numFmt(c.format) } })),
  ];
  for (const row of rows) {
    const o: Record<string, unknown> = {};
    for (const f of r.fields) {
      const v = row[f.key];
      o[f.key] = f.type === "date" && v ? new Date(String(v).slice(0, 10) + "T00:00:00Z") : v ?? null;
    }
    for (const c of comp) o[`__${c.key}`] = c.fn(row);
    ws.addRow(o);
  }
  styleHeader(ws);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
  return ws;
}

export function addTableSheet(wb: ExcelJS.Workbook, name: string, columns: { header: string; key: string; format?: string; width?: number }[], rows: Record<string, unknown>[]) {
  const ws = wb.addWorksheet(name.slice(0, 31));
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? Math.max(12, c.header.length + 4), style: { numFmt: c.format ? numFmt(c.format) : undefined } }));
  for (const r of rows) ws.addRow(r);
  styleHeader(ws);
  return ws;
}

export async function toBuffer(wb: ExcelJS.Workbook) {
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function toCSV(r: Resource, rows: Row[]) {
  const comp = r.computed ?? [];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = [...r.fields.map((f) => f.label), ...comp.map((c) => c.label)];
  const lines = [head.map(esc).join(",")];
  for (const row of rows) lines.push([...r.fields.map((f) => row[f.key]), ...comp.map((c) => c.fn(row))].map(esc).join(","));
  return "﻿" + lines.join("\n");
}
