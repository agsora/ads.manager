"use client";

import { PageHeader } from "@/components/shell";
import { useAnalytics } from "@/components/use-analytics";
import { Card, Empty, MiniTable, PageSkeleton } from "@/components/charts";
import { fmtNum, fmtPct } from "@/lib/format";

const mins = (v: number | null | undefined) => (v === null || v === undefined ? "–" : v < 1 ? "<1 mnt" : v >= 120 ? `${fmtNum(v / 60, 1)} jam` : `${fmtNum(v, 0)} mnt`);

export default function PerformancePage() {
  const { data: a, loading, error } = useAnalytics();
  if (!a) return loading || !error ? <PageSkeleton kpis={4} cards={2} /> : null;
  const f = a.financing;
  const s = f.sla;
  const tone = (v: number | null | undefined, good: number, bad: number) => (v === null || v === undefined ? "" : v <= good ? "text-[var(--good-ink)]" : v >= bad ? "text-[var(--critical-ink)]" : "text-[var(--warning-ink)]");

  const cols = (first: string) => [
    { key: "name", label: first },
    { key: "leads", label: "Leads", format: "number" },
    { key: "hot", label: "HOT", format: "number" },
    { key: "survey", label: "Survei", format: "number" },
    { key: "approve", label: "Approve", format: "number" },
    { key: "akad", label: "Akad", format: "number" },
    { key: "akadRate", label: "Lead→Akad", format: "percent" },
    { key: "disbursed", label: "Pencairan", format: "money" },
    { key: "avgReplyText", label: "Rata-rata respons" },
    { key: "within5", label: "≤ 5 menit", format: "percent" },
  ];
  const prep = (rows: typeof f.byBranch) => rows.map((r) => ({ ...r, avgReplyText: mins(r.avgReply) }));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="WhatsApp"
        title="Cabang & Kecepatan Respons"
        desc="Bandingkan cabang dan CS: berapa lead masuk, berapa yang sampai akad, dan secepat apa chat pertama dibalas. Lead yang dibalas lebih dari 5 menit jauh lebih mudah hilang. Isi Cabang, PIC, Jam Chat Masuk, dan Jam Dibalas Pertama di WA Leads."
      />

      <div className="stat-grid">
        <div className="px-4 py-4">
          <div className="text-[12.5px] text-[var(--ink-2)]">Rata-rata respons</div>
          <div className={`serif mt-1 text-[26px] tnum ${tone(s.avg, 5, 30)}`}>{mins(s.avg)}</div>
          <div className="mt-1 text-[12px] text-[var(--muted)]">Median {mins(s.median)}</div>
        </div>
        <div className="px-4 py-4">
          <div className="text-[12.5px] text-[var(--ink-2)]">Dibalas ≤ 5 menit</div>
          <div className="serif mt-1 text-[26px] tnum">{fmtPct(s.within5, 0)}</div>
          <div className="mt-1 text-[12px] text-[var(--muted)]">Target: 80% atau lebih</div>
        </div>
        <div className="px-4 py-4">
          <div className="text-[12.5px] text-[var(--ink-2)]">Dibalas ≤ 30 menit</div>
          <div className="serif mt-1 text-[26px] tnum">{fmtPct(s.within30, 0)}</div>
        </div>
        <div className="px-4 py-4">
          <div className="text-[12.5px] text-[var(--ink-2)]">Lambat (&gt; 1 jam)</div>
          <div className={`serif mt-1 text-[26px] tnum ${s.over60 ? "text-[var(--critical-ink)]" : ""}`}>{fmtNum(s.over60)}</div>
          <div className="mt-1 text-[12px] text-[var(--muted)]">dari {fmtNum(s.measured)} lead yang terukur</div>
        </div>
      </div>

      {s.measured === 0 && <Empty text="Belum ada data respons — isi Jam Chat Masuk dan Jam Dibalas Pertama di WA Leads" />}

      <Card title="Per cabang" subtitle="Urut dari lead terbanyak">
        <MiniTable cols={cols("Cabang")} rows={prep(f.byBranch)} empty="Belum ada data leads" />
      </Card>
      <Card title="Per CS / PIC" subtitle="Siapa yang cepat membalas dan siapa yang paling banyak membawa lead sampai akad">
        <MiniTable cols={cols("PIC / CS")} rows={prep(f.byPic)} empty="Belum ada data leads" />
      </Card>
    </div>
  );
}
