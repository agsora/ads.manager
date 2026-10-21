export const fmtNum = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined || !Number.isFinite(v) ? "–" : v.toLocaleString("id-ID", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export const fmtMoney = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? "–" : (v < 0 && Math.round(v) !== 0 ? "-" : "") + "Rp " + Math.abs(Math.round(v)).toLocaleString("id-ID");

export const fmtMoneyShort = (v: number | null | undefined) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  if (a >= 1e9) return "Rp " + (v / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " M";
  if (a >= 1e6) return "Rp " + (v / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " jt";
  if (a >= 1e3) return "Rp " + (v / 1e3).toLocaleString("id-ID", { maximumFractionDigits: 0 }) + " rb";
  return fmtMoney(v);
};

export const fmtPct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || !Number.isFinite(v) ? "–" : (v * 100).toLocaleString("id-ID", { maximumFractionDigits: digits }) + "%";

export const fmtDate = (v: unknown) => {
  if (!v) return "–";
  const s = String(v).slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!d) return s;
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${+d} ${months[+m - 1]} ${y}`;
};

export const fmtCompact = (v: number | null | undefined) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "M";
  if (a >= 1e6) return (v / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "jt";
  if (a >= 1e4) return (v / 1e3).toLocaleString("id-ID", { maximumFractionDigits: 0 }) + "rb";
  return v.toLocaleString("id-ID", { maximumFractionDigits: 1 });
};

export function formatValue(v: unknown, format: string): string {
  if (v === null || v === undefined || v === "") return "–";
  const x = typeof v === "number" ? v : Number(v);
  switch (format) {
    case "money":
      return fmtMoney(x);
    case "percent":
      return fmtPct(x);
    case "decimal":
      return fmtNum(x, 2);
    case "number":
    case "rating":
      return fmtNum(x, Math.abs(x) >= 100 ? 0 : 1);
    case "date":
      return fmtDate(v);
    default:
      return String(v);
  }
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const addDays = (iso: string, days: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const diffDays = (a: string, b: string) =>
  Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000);

export const monthStart = (iso: string) => iso.slice(0, 8) + "01";
export const monthEnd = (iso: string) => {
  const d = new Date(iso.slice(0, 8) + "01T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
};
