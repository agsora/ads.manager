import { ExternalLink, MessageCircle, Star } from "lucide-react";
import type { Field } from "@/lib/resources";
import { fmtDate, fmtMoney, fmtNum, fmtPct, formatValue } from "@/lib/format";

const TONES: Record<string, string> = {
  green: "bg-[#eaf2e3] text-[#2f6b2f]",
  blue: "bg-[#e7eef7] text-[#2c5687]",
  amber: "bg-[#f8eed6] text-[#7d5300]",
  red: "bg-[#f8e4dc] text-[#9a3b1f]",
  orange: "bg-[#f5e6de] text-[#a34f31]",
  gray: "bg-[#efede6] text-[#5e5d59]",
  violet: "bg-[#ebe8f5] text-[#4a3f8f]",
};

const TONE_BY_VALUE: Record<string, string> = {
  done: "green", posted: "green", deal: "green", selesai: "green", terkirim: "green", ya: "green", positif: "green", tayang: "green", "deal reservasi": "green",
  running: "blue", scheduled: "blue", terjadwal: "blue", produksi: "blue", "follow-up": "blue", "follow up": "blue", review: "blue", negosiasi: "blue",
  planning: "violet", ide: "violet", draft: "violet", "desain selesai": "orange",
  hold: "amber", pending: "amber", netral: "amber", warm: "orange",
  hot: "red", cancel: "gray", batal: "gray", nonaktif: "gray", ghosting: "red", negatif: "red", tidak: "red", gagal: "red",
  cold: "blue",
  "menunggu review": "amber", disetujui: "green", "perlu revisi": "red", lengkap: "green", "belum diisi": "amber", "belum tayang": "red",
  yes: "green", no: "gray", "belum dikirim": "gray", dibaca: "blue", dibalas: "violet", tertarik: "orange", "tidak tertarik": "gray", "nomor tidak aktif": "red",
};

export function Chip({ value, tone }: { value: string; tone?: string }) {
  const t = tone ?? TONE_BY_VALUE[value.toLowerCase().trim()] ?? "gray";
  return <span className={`chip ${TONES[t]}`}>{value}</span>;
}

export function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1 tnum" aria-label={`${value} bintang`}>
      <Star size={14} className="fill-[var(--s4)] text-[var(--s4)]" />
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
        <a href={String(v)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--accent-ink)] hover:underline" onClick={(e) => e.stopPropagation()}>
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
      return <span className="line-clamp-2 block min-w-[180px] max-w-[300px] whitespace-normal text-[13px] text-[var(--ink-2)]">{String(v)}</span>;
    default:
      return <span className="whitespace-nowrap">{String(v)}</span>;
  }
}

export function renderComputed(format: string, v: unknown) {
  if (v === null || v === undefined) return <span className="text-[var(--muted)]">–</span>;
  if (format === "text") {
    const s = String(v);
    const tone = TONE_BY_VALUE[s.toLowerCase()] ?? (/jatuh tempo|ghosting/i.test(s) ? "red" : /selesai|ya$/i.test(s) ? "green" : /telat/i.test(s) ? "amber" : "gray");
    return <Chip value={s} tone={tone} />;
  }
  return <span className="tnum whitespace-nowrap">{formatValue(v, format)}</span>;
}
