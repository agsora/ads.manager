import { ExternalLink, MessageCircle, Star } from "lucide-react";
import type { Field } from "@/lib/resources";
import { fmtDate, fmtMoney, fmtNum, fmtPct, formatValue } from "@/lib/format";

const TONES: Record<string, string> = {
  green: "bg-[#e7f6e7] text-[#006300]",
  blue: "bg-[#e8f1fc] text-[#1c5cab]",
  amber: "bg-[#fdf3dc] text-[#8a5a00]",
  red: "bg-[#fbeaea] text-[#a12a2a]",
  orange: "bg-[#fdeee7] text-[#a8441b]",
  gray: "bg-[#f1f5f9] text-[#475569]",
  violet: "bg-[#efedfb] text-[#4a3aa7]",
};

const TONE_BY_VALUE: Record<string, string> = {
  done: "green", posted: "green", deal: "green", selesai: "green", terkirim: "green", ya: "green", positif: "green", tayang: "green", "deal reservasi": "green",
  running: "blue", scheduled: "blue", terjadwal: "blue", produksi: "blue", "follow-up": "blue", "follow up": "blue", review: "blue", negosiasi: "blue",
  planning: "violet", ide: "violet", draft: "violet",
  hold: "amber", pending: "amber", netral: "amber", warm: "orange",
  hot: "red", cancel: "gray", batal: "gray", nonaktif: "gray", ghosting: "red", negatif: "red", tidak: "red", gagal: "red",
  cold: "blue",
};

export function Chip({ value, tone }: { value: string; tone?: string }) {
  const t = tone ?? TONE_BY_VALUE[value.toLowerCase().trim()] ?? "gray";
  return <span className={`chip ${TONES[t]}`}>{value}</span>;
}

export function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1 tnum" aria-label={`${value} bintang`}>
      <Star size={14} className="fill-[#eda100] text-[#eda100]" />
      <span className="font-semibold">{fmtNum(value, 1)}</span>
    </span>
  );
}

export function renderCell(f: Pick<Field, "type" | "key">, v: unknown) {
  if (v === null || v === undefined || v === "") return <span className="text-[var(--muted)]">–</span>;
  switch (f.type) {
    case "date":
      return <span className="tnum whitespace-nowrap">{fmtDate(v)}</span>;
    case "money":
      return <span className="tnum whitespace-nowrap">{fmtMoney(Number(v))}</span>;
    case "percent":
      return <span className="tnum">{fmtPct(Number(v), 2)}</span>;
    case "number":
      return <span className="tnum">{fmtNum(Number(v), 2)}</span>;
    case "rating":
      return <Stars value={Number(v)} />;
    case "url":
      return (
        <a href={String(v)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline" onClick={(e) => e.stopPropagation()}>
          Buka <ExternalLink size={12} />
        </a>
      );
    case "phone": {
      const digits = String(v).replace(/\D/g, "").replace(/^0/, "62");
      return (
        <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap text-[var(--good-ink)] hover:underline" onClick={(e) => e.stopPropagation()}>
          <MessageCircle size={13} /> {String(v)}
        </a>
      );
    }
    case "select":
      return <Chip value={String(v)} />;
    case "longtext":
      return <span className="line-clamp-2 max-w-[280px] text-[13px] text-[var(--ink-2)]">{String(v)}</span>;
    default:
      return <span className="whitespace-nowrap">{String(v)}</span>;
  }
}

export function renderComputed(format: string, v: unknown) {
  if (v === null || v === undefined) return <span className="text-[var(--muted)]">–</span>;
  if (format === "text") {
    const s = String(v);
    const tone = /jatuh tempo|ghosting/i.test(s) ? "red" : /selesai|ya$/i.test(s) ? "green" : /telat/i.test(s) ? "amber" : "gray";
    return <Chip value={s} tone={tone} />;
  }
  return <span className="tnum whitespace-nowrap">{formatValue(v, format)}</span>;
}
