import type { Field } from "./resources";

const ID_MONTHS: Record<string, number> = {
  jan: 1, januari: 1, january: 1, feb: 2, februari: 2, february: 2, mar: 3, maret: 3, march: 3,
  apr: 4, april: 4, mei: 5, may: 5, jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7,
  agu: 8, agt: 8, agustus: 8, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10, nov: 11, november: 11, des: 12, desember: 12, dec: 12, december: 12,
};

const pad = (x: number) => String(x).padStart(2, "0");
const iso = (y: number, m: number, d: number) => {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
};

export function toISODate(v: unknown): string | null {
  if (v === null || v === undefined || v === "" || v === "-") return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    // Excel dates arrive as UTC midnight
    return iso(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  }
  if (typeof v === "number") {
    if (v > 20000 && v < 80000) {
      const d = new Date(Math.round((v - 25569) * 86400000));
      return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    return null;
  }
  const s = String(v).trim().toLowerCase();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
  if (m) return iso(+m[3], +m[2], +m[1]); // Indonesian D/M/Y
  m = s.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (m && ID_MONTHS[m[2]]) return iso(+m[3], ID_MONTHS[m[2]], +m[1]);
  m = s.match(/^([a-z]+)\s+(\d{4})$/);
  if (m && ID_MONTHS[m[1]]) return iso(+m[2], ID_MONTHS[m[1]], 1);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "" || v === "-") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "object" && v && "result" in v) return toNumber((v as { result: unknown }).result);
  let s = String(v).trim().replace(/rp\.?/i, "").replace(/\s/g, "").replace(/%$/, "");
  if (!s) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", "."); // 1.250.000,50
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, ""); // 1,250,000.50
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(",", "."); // 4,5
  s = s.replace(/[^0-9.\-]/g, "");
  const x = Number(s);
  return Number.isFinite(x) && s !== "" ? x : null;
}

function toTime(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`;
  if (typeof v === "number" && v < 1) {
    const mins = Math.round(v * 1440);
    return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
  }
  const m = String(v).match(/(\d{1,2})[:.](\d{2})/);
  return m ? `${pad(+m[1])}:${m[2]}` : String(v).trim() || null;
}

function cellText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("text" in o) return cellText(o.text);
    if ("hyperlink" in o) return String(o.hyperlink);
    if ("richText" in o && Array.isArray(o.richText)) return o.richText.map((t: { text: string }) => t.text).join("");
    if ("result" in o) return cellText(o.result);
    if (v instanceof Date) return toISODate(v);
  }
  const s = String(v).trim();
  return s === "" || s === "-" ? null : s;
}

/** Convert any raw (form / Excel / CSV) value to the DB value for a field. */
export function coerce(f: Field, v: unknown, fromImport = false): unknown {
  switch (f.type) {
    case "date":
      return toISODate(typeof v === "object" && v && !(v instanceof Date) ? cellText(v) : v);
    case "time":
      return toTime(v);
    case "phone": {
      const s = typeof v === "number" ? String(Math.round(v)) : cellText(v);
      if (!s) return null;
      // Excel drops the leading 0 of numbers stored as numeric cells: 81212770981 -> 081212770981
      return /^8\d{8,12}$/.test(s) ? "0" + s : s;
    }
    case "number":
    case "money":
    case "rating":
      return toNumber(typeof v === "object" && v && !(v instanceof Date) ? cellText(v) : v);
    case "percent": {
      const raw = typeof v === "string" && v.includes("%");
      const x = toNumber(v);
      if (x === null) return null;
      // form input is always in percent units; imports may be fraction (0.05) or percent (5 / "5%")
      if (!fromImport || raw || Math.abs(x) > 1) return x / 100;
      return x;
    }
    default:
      return cellText(v);
  }
}
