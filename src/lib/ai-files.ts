import ExcelJS from "exceljs";
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { listRows } from "./repo";
import { RESOURCE_MAP, type Row } from "./resources";
import { todayISO } from "./format";

/** A file the AI produced for the user. Bytes are sent to the browser only, never back to the model. */
export interface AiFile {
  name: string;
  mime: string;
  b64: string;
  kind: "xlsx" | "csv" | "docx" | "pdf" | "txt" | "svg";
}

const MAX_BYTES = 3_000_000;
const MAX_ROWS = 5000;
const MIME = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv;charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  txt: "text/plain;charset=utf-8",
  svg: "image/svg+xml",
} as const;

const slug = (s: string) =>
  (s || "dokumen")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "dokumen";

/** Cells that start with = + - @ would run as formulas in Excel: keep them as text. */
const safeCell = (v: unknown): string | number | boolean | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" || typeof v === "boolean") return v;
  const s = String(v);
  return /^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s) ? "'" + s : s;
};

interface SheetIn {
  name: string;
  columns: string[];
  rows: unknown[][];
}

/** Rows come either from the database (resource) or from numbers the model already computed (sheets). */
async function sheetsFor(orgId: number, a: Record<string, unknown>): Promise<SheetIn[]> {
  if (a.resource) {
    const r = RESOURCE_MAP[String(a.resource)];
    if (!r) throw new Error(`Resource "${a.resource}" tidak dikenal`);
    const ok = (d: unknown) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
    let rows = await listRows(orgId, r, { from: ok(a.from) ? (a.from as string) : null, to: ok(a.to) ? (a.to as string) : null, brand: a.brand ? String(a.brand) : null, search: a.search ? String(a.search) : null, limit: MAX_ROWS });
    const where = a.where && typeof a.where === "object" ? (a.where as Record<string, unknown>) : null;
    if (where) {
      const keys = Object.keys(where).filter((k) => r.fields.some((f) => f.key === k));
      const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
      rows = rows.filter((row: Row) => keys.every((k) => norm(row[k]) === norm(where[k])));
    }
    const want = Array.isArray(a.fields) ? (a.fields as unknown[]).map(String) : [];
    const fields = want.length ? r.fields.filter((f) => want.includes(f.key)) : r.fields;
    const comps = want.length ? [] : r.computed ?? [];
    return [
      {
        name: r.label.slice(0, 30),
        columns: [...fields.map((f) => f.label), ...comps.map((c) => c.label)],
        rows: rows.map((row: Row) => [...fields.map((f) => row[f.key]), ...comps.map((c) => c.fn(row))]),
      },
    ];
  }
  const raw = Array.isArray(a.sheets) ? (a.sheets as Record<string, unknown>[]) : [];
  const sheets = raw
    .map((s, i) => ({ name: String(s.name ?? `Sheet ${i + 1}`).slice(0, 30), columns: Array.isArray(s.columns) ? (s.columns as unknown[]).map(String) : [], rows: Array.isArray(s.rows) ? (s.rows as unknown[][]).filter(Array.isArray).slice(0, MAX_ROWS) : [] }))
    .filter((s) => s.columns.length);
  if (!sheets.length) throw new Error("Isi 'resource' (ambil dari database) atau 'sheets' (kolom dan baris yang sudah dihitung)");
  return sheets;
}

async function toXlsx(title: string, sheets: SheetIn[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Ads Manager";
  const used = new Set<string>();
  for (const s of sheets) {
    let nm = s.name.replace(/[\\/?*[\]:]/g, " ").trim() || "Data";
    while (used.has(nm.toLowerCase())) nm = nm.slice(0, 27) + "_" + used.size;
    used.add(nm.toLowerCase());
    const ws = wb.addWorksheet(nm, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.addRow(s.columns);
    for (const r of s.rows) ws.addRow(r.map(safeCell));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3A3A36" } };
    s.columns.forEach((c, i) => {
      const longest = Math.max(c.length, ...s.rows.slice(0, 200).map((r) => String(r[i] ?? "").length));
      ws.getColumn(i + 1).width = Math.min(48, Math.max(10, longest + 2));
    });
  }
  void title;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function toCsv(sheet: SheetIn) {
  const esc = (v: unknown) => {
    const c = safeCell(v);
    const s = c === null ? "" : String(c);
    return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM so Excel reads UTF-8; semicolon is what Indonesian Excel expects
  return Buffer.from("﻿" + [sheet.columns, ...sheet.rows].map((r) => r.map(esc).join(";")).join("\r\n"), "utf8");
}

// ---------------------------------------------------------------------------------------------
// Documents from light markdown: # headings, - bullets, 1. lists, | tables |, **bold**
// ---------------------------------------------------------------------------------------------
type Block = { t: "h"; level: number; text: string } | { t: "p"; text: string } | { t: "li"; text: string; ordered: boolean } | { t: "table"; rows: string[][] };

function parseBlocks(md: string): Block[] {
  const out: Block[] = [];
  const lines = md.replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (!line.trim() || /^\s*[-_*]{3,}\s*$/.test(line)) continue;
    if (line.includes("|") && /^\s*\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        if (!/^\s*\|[\s:|-]+\|?\s*$/.test(lines[i])) rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
        i++;
      }
      i--;
      if (rows.length) out.push({ t: "table", rows });
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) out.push({ t: "h", level: h[1].length, text: h[2] });
    else if (/^\s*[-*•]\s+/.test(line)) out.push({ t: "li", text: line.replace(/^\s*[-*•]\s+/, ""), ordered: false });
    else if (/^\s*\d+[.)]\s+/.test(line)) out.push({ t: "li", text: line.replace(/^\s*\d+[.)]\s+/, ""), ordered: true });
    else out.push({ t: "p", text: line });
  }
  return out;
}

const runs = (s: string, size?: number) =>
  s
    .replace(/`/g, "")
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((p) => (p.startsWith("**") && p.endsWith("**") ? new TextRun({ text: p.slice(2, -2), bold: true, size }) : new TextRun({ text: p, size })));

async function toDocx(title: string, content: string) {
  const H = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];
  const kids: (Paragraph | Table)[] = [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: title, bold: true })] }), new Paragraph({ children: [new TextRun({ text: `Dibuat ${todayISO()}`, color: "888888", size: 18 })] })];
  let num = 0;
  for (const b of parseBlocks(content)) {
    if (b.t !== "li" || !b.ordered) num = 0;
    if (b.t === "h") kids.push(new Paragraph({ heading: H[Math.min(b.level, 4) - 1], children: runs(b.text), spacing: { before: 200, after: 80 } }));
    else if (b.t === "p") kids.push(new Paragraph({ children: runs(b.text), spacing: { after: 100 } }));
    else if (b.t === "li") kids.push(b.ordered ? new Paragraph({ children: [new TextRun(`${++num}. `), ...runs(b.text)], indent: { left: 360 }, spacing: { after: 60 } }) : new Paragraph({ children: runs(b.text), bullet: { level: 0 }, spacing: { after: 60 } }));
    else
      kids.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: b.rows.map((r, ri) => new TableRow({ tableHeader: ri === 0, children: r.map((c) => new TableCell({ children: [new Paragraph({ alignment: AlignmentType.LEFT, children: ri === 0 ? [new TextRun({ text: c.replace(/\*\*/g, ""), bold: true })] : runs(c) })] })) })),
        }),
        new Paragraph({ children: [] }),
      );
  }
  return Buffer.from(await Packer.toBuffer(new Document({ creator: "Ads Manager", title, sections: [{ children: kids }] })));
}

/** pdf-lib's built-in fonts only cover Latin-1: swap the few symbols the model likes to use. */
const latin = (s: string) =>
  s
    .replace(/[→⇒➜]/g, "->")
    .replace(/[←]/g, "<-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[★⭐]/g, "*")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/[^\x09\x0a\x20-\x7e\xa0-\xff•]/g, "?");

async function toPdf(title: string, content: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28;
  const H = 841.89;
  const M = 50;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const need = (h: number) => {
    if (y - h < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };
  const wrap = (text: string, f: PDFFont, size: number, width: number) => {
    const out: string[] = [];
    let cur = "";
    for (const w of text.split(/\s+/)) {
      const next = cur ? cur + " " + w : w;
      if (f.widthOfTextAtSize(next, size) > width && cur) {
        out.push(cur);
        cur = w;
      } else cur = next;
    }
    if (cur) out.push(cur);
    return out;
  };
  const write = (text: string, f: PDFFont, size: number, indent = 0, gap = 4) => {
    for (const l of wrap(latin(text), f, size, W - 2 * M - indent)) {
      need(size + 3);
      y -= size + 3;
      page.drawText(l, { x: M + indent, y, size, font: f, color: rgb(0.1, 0.1, 0.09) });
    }
    y -= gap;
  };
  write(title, bold, 20, 0, 2);
  write(`Dibuat ${todayISO()}`, font, 9, 0, 10);
  let num = 0;
  for (const b of parseBlocks(content)) {
    if (b.t !== "li" || !b.ordered) num = 0;
    if (b.t === "h") {
      y -= 6;
      write(b.text, bold, b.level === 1 ? 16 : b.level === 2 ? 13.5 : 12, 0, 3);
    } else if (b.t === "p") write(b.text, font, 10.5);
    else if (b.t === "li") write(`${b.ordered ? ++num + "." : "•"} ${b.text}`, font, 10.5, 12, 2);
    else {
      const cols = Math.max(...b.rows.map((r) => r.length));
      const cw = (W - 2 * M) / cols;
      b.rows.forEach((r, ri) => {
        const cells = r.map((c) => wrap(latin(c), ri === 0 ? bold : font, 9, cw - 6));
        const lines = Math.max(1, ...cells.map((c) => c.length));
        need(lines * 12 + 6);
        const top = y;
        if (ri === 0) page.drawRectangle({ x: M, y: y - lines * 12 - 4, width: W - 2 * M, height: lines * 12 + 4, color: rgb(0.93, 0.92, 0.89) });
        cells.forEach((c, ci) => c.forEach((l, li) => page.drawText(l, { x: M + ci * cw + 3, y: top - 11 - li * 12, size: 9, font: ri === 0 ? bold : font, color: rgb(0.1, 0.1, 0.09) })));
        y -= lines * 12 + 4;
        page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: rgb(0.8, 0.79, 0.75) });
      });
      y -= 8;
    }
  }
  return Buffer.from(await pdf.save());
}

// ---------------------------------------------------------------------------------------------
// Charts: drawn as SVG on the server, the browser also offers a PNG copy
// ---------------------------------------------------------------------------------------------
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const PALETTE = ["#c2603f", "#3d7a8a", "#c79a2b", "#5d8a54", "#7a5c99", "#b5506b"];
const compact = (v: number) => (Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(1).replace(/\.0$/, "") + " M" : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1).replace(/\.0$/, "") + " jt" : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(1).replace(/\.0$/, "") + " rb" : String(Math.round(v * 100) / 100));

function chartSvg(a: Record<string, unknown>, title: string) {
  const labels = (Array.isArray(a.labels) ? (a.labels as unknown[]) : []).map(String).slice(0, 40);
  const series = (Array.isArray(a.series) ? (a.series as Record<string, unknown>[]) : [])
    .map((s, i) => ({ name: String(s.name ?? `Seri ${i + 1}`), values: (Array.isArray(s.values) ? (s.values as unknown[]) : []).map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0)).slice(0, labels.length) }))
    .slice(0, 6);
  if (!labels.length || !series.length) throw new Error("Grafik butuh 'labels' dan minimal satu 'series' berisi angka");
  const type = ["bar", "line", "pie"].includes(String(a.chart_type)) ? String(a.chart_type) : "bar";
  const W = 900;
  const Ht = 520;
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Ht}" width="${W}" height="${Ht}" font-family="Helvetica, Arial, sans-serif"><rect width="${W}" height="${Ht}" fill="#faf9f5"/><text x="30" y="40" font-size="22" font-weight="700" fill="#1f1e1a">${esc(title)}</text>`;
  let body = "";
  if (type === "pie") {
    const vals = series[0].values.map((v) => Math.max(0, v));
    const total = vals.reduce((t, v) => t + v, 0) || 1;
    let ang = -Math.PI / 2;
    const cx = 270;
    const cy = 290;
    const r = 180;
    vals.forEach((v, i) => {
      const a2 = ang + (v / total) * Math.PI * 2;
      const large = a2 - ang > Math.PI ? 1 : 0;
      if (v / total > 0.9999) body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${PALETTE[i % 6]}"/>`;
      else if (v > 0) body += `<path d="M${cx},${cy} L${cx + r * Math.cos(ang)},${cy + r * Math.sin(ang)} A${r},${r} 0 ${large} 1 ${cx + r * Math.cos(a2)},${cy + r * Math.sin(a2)} Z" fill="${PALETTE[i % 6]}" stroke="#faf9f5" stroke-width="2"/>`;
      ang = a2;
      body += `<rect x="520" y="${90 + i * 26}" width="14" height="14" rx="3" fill="${PALETTE[i % 6]}"/><text x="542" y="${102 + i * 26}" font-size="14" fill="#3a3a36">${esc(labels[i] ?? "")}: ${compact(v)} (${Math.round((v / total) * 100)}%)</text>`;
    });
    return head + body + "</svg>";
  }
  const L = 80;
  const R = W - 30;
  const T = 80;
  const B = Ht - 90;
  const all = series.flatMap((s) => s.values);
  const max = Math.max(0, ...all);
  const min = Math.min(0, ...all);
  const span = max - min || 1;
  const yOf = (v: number) => B - ((v - min) / span) * (B - T);
  for (let i = 0; i <= 4; i++) {
    const v = min + (span * i) / 4;
    body += `<line x1="${L}" x2="${R}" y1="${yOf(v)}" y2="${yOf(v)}" stroke="#e4e2da"/><text x="${L - 8}" y="${yOf(v) + 4}" font-size="12" text-anchor="end" fill="#6b6a63">${compact(v)}</text>`;
  }
  const step = (R - L) / labels.length;
  labels.forEach((lb, i) => {
    const x = L + step * i + step / 2;
    const short = lb.length > 12 ? lb.slice(0, 11) + "…" : lb;
    body += `<text x="${x}" y="${B + 20}" font-size="12" text-anchor="${labels.length > 10 ? "end" : "middle"}" fill="#3a3a36" ${labels.length > 10 ? `transform="rotate(-35 ${x} ${B + 20})"` : ""}>${esc(short)}</text>`;
  });
  if (type === "bar") {
    const bw = Math.min(48, (step * 0.8) / series.length);
    series.forEach((s, si) =>
      s.values.forEach((v, i) => {
        const x = L + step * i + step / 2 - (bw * series.length) / 2 + bw * si;
        const y0 = yOf(Math.max(v, 0));
        body += `<rect x="${x}" y="${y0}" width="${bw - 2}" height="${Math.max(1, Math.abs(yOf(v) - yOf(0)))}" rx="3" fill="${PALETTE[si % 6]}"/>`;
        if (labels.length <= 12 && series.length === 1) body += `<text x="${x + bw / 2 - 1}" y="${y0 - 6}" font-size="11" text-anchor="middle" fill="#3a3a36">${compact(v)}</text>`;
      }),
    );
  } else {
    series.forEach((s, si) => {
      const pts = s.values.map((v, i) => `${L + step * i + step / 2},${yOf(v)}`);
      body += `<polyline points="${pts.join(" ")}" fill="none" stroke="${PALETTE[si % 6]}" stroke-width="3" stroke-linejoin="round"/>` + s.values.map((v, i) => `<circle cx="${L + step * i + step / 2}" cy="${yOf(v)}" r="4" fill="${PALETTE[si % 6]}"/>`).join("");
    });
  }
  if (series.length > 1) series.forEach((s, i) => (body += `<rect x="${L + i * 150}" y="${Ht - 36}" width="14" height="14" rx="3" fill="${PALETTE[i % 6]}"/><text x="${L + i * 150 + 20}" y="${Ht - 24}" font-size="13" fill="#3a3a36">${esc(s.name.slice(0, 18))}</text>`));
  else body += `<text x="${L}" y="${Ht - 24}" font-size="13" fill="#6b6a63">${esc(series[0].name)}</text>`;
  return head + body + "</svg>";
}

/** The create_file tool: builds the requested file and returns it (plus a short note for the model). */
export async function createFile(orgId: number, a: Record<string, unknown>): Promise<AiFile> {
  const fmt = String(a.format ?? "").toLowerCase();
  const title = String(a.title ?? "").trim().slice(0, 120) || "Dokumen";
  const base = `${slug(title)}-${todayISO()}`;
  let buf: Buffer;
  let kind: AiFile["kind"];
  if (fmt === "xlsx" || fmt === "excel" || fmt === "csv") {
    const sheets = await sheetsFor(orgId, a);
    if (fmt === "csv") {
      kind = "csv";
      buf = toCsv(sheets[0]);
    } else {
      kind = "xlsx";
      buf = await toXlsx(title, sheets);
    }
  } else if (fmt === "docx" || fmt === "word" || fmt === "pdf" || fmt === "txt") {
    const content = String(a.content ?? "").slice(0, 60_000);
    if (!content.trim()) throw new Error("Isi 'content' dengan teks dokumen");
    if (fmt === "pdf") {
      kind = "pdf";
      buf = await toPdf(title, content);
    } else if (fmt === "txt") {
      kind = "txt";
      buf = Buffer.from(content.replace(/\*\*/g, ""), "utf8");
    } else {
      kind = "docx";
      buf = await toDocx(title, content);
    }
  } else if (fmt === "png" || fmt === "svg" || fmt === "image" || fmt === "chart") {
    kind = "svg";
    buf = Buffer.from(chartSvg(a, title), "utf8");
  } else throw new Error("Format tidak didukung. Pilihan: xlsx, csv, docx, pdf, txt, png (grafik)");
  if (buf.length > MAX_BYTES) throw new Error("File terlalu besar. Persempit periode atau kolomnya.");
  return { name: `${base}.${kind}`, mime: MIME[kind], b64: buf.toString("base64"), kind };
}
