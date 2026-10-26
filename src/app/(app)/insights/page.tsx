"use client";

import { useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { useFilter } from "@/components/providers";
import { useAnalytics } from "@/components/use-analytics";
import { AiAdvice } from "@/components/ai-advice";
import { Card, InsightItem, PageSkeleton, ScoreRing, scoreTone, scoreWord } from "@/components/charts";
import { fmtDate } from "@/lib/format";
import type { Insight } from "@/lib/analytics";

const LEVELS: { key: Insight["level"] | ""; label: string }[] = [
  { key: "", label: "Semua" },
  { key: "critical", label: "Kritis" },
  { key: "warning", label: "Perlu perhatian" },
  { key: "info", label: "Saran" },
  { key: "good", label: "Bagus" },
];

export default function InsightsPage() {
  const f = useFilter();
  const { data: a, loading } = useAnalytics();
  const [level, setLevel] = useState<string>("");
  const [area, setArea] = useState<string>("");
  const [done, setDone] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      setDone(JSON.parse(localStorage.getItem("am_done_actions") || "{}"));
    } catch {
      /* ignore */
    }
  }, []);
  const toggle = (k: string) =>
    setDone((d) => {
      const nx = { ...d, [k]: !d[k] };
      try {
        localStorage.setItem("am_done_actions", JSON.stringify(nx));
      } catch {
        /* ignore */
      }
      return nx;
    });

  if (!a) return loading ? <PageSkeleton kpis={4} /> : null;
  const areas = [...new Set(a.insights.map((i) => i.area))];
  const list = a.insights.filter((i) => (!level || i.level === level) && (!area || i.area === area));
  const actions = a.insights.filter((i) => i.level === "critical" || i.level === "warning");
  const count = (l: string) => a.insights.filter((i) => i.level === l).length;

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Analisis otomatis" title="Insight & Rekomendasi" desc={`Kesimpulan otomatis dari data ads, leads, blast, konten, reputasi & influencer periode ${fmtDate(a.period.from)} – ${fmtDate(a.period.to)}. Setiap temuan disertai tindakan yang disarankan.`}>
        <a className="btn" href={`/api/report?${f.qs}`}>
          <Download size={15} /> Excel
        </a>
        <button className="btn" onClick={() => window.print()}>
          <Printer size={15} /> Cetak
        </button>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Kesehatan Marketing">
          <div className="flex items-center gap-4">
            <ScoreRing value={a.scores.overall} size={96} />
            <div className="min-w-0">
              <div className="eyebrow">Keseluruhan</div>
              <div className="serif text-[22px] leading-tight">{scoreWord(a.scores.overall)}</div>
            </div>
          </div>
          <ul className="mt-5 space-y-3.5">
            {(
              [
                ["Iklan", a.scores.ads],
                ["Leads & Closing", a.scores.leads],
                ["Konten", a.scores.content],
                ["Reputasi", a.scores.reputation],
              ] as [string, number | null][]
            ).map(([label, v]) => (
              <li key={label}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate font-medium">{label}</span>
                  <span className="shrink-0 text-[var(--muted)]">
                    <b className="serif mr-1.5 text-[16px] text-[var(--ink)] tnum">{v ?? "–"}</b>
                    {scoreWord(v)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--track)]">
                  <div className="h-1.5 rounded-full" style={{ width: `${v ?? 0}%`, background: scoreTone(v), transition: "width .8s cubic-bezier(.2,.8,.2,1)" }} />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-5 grid grid-cols-2 gap-2 border-t border-[var(--line)] pt-4 text-[12.5px] sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            {(
              [
                ["critical", "Kritis", "var(--critical-ink)"],
                ["warning", "Perhatian", "var(--warning-ink)"],
                ["info", "Saran", "var(--ink-2)"],
                ["good", "Bagus", "var(--good-ink)"],
              ] as const
            ).map(([k, label, color]) => (
              <div key={k} className="min-w-0 rounded-lg border border-[var(--line)] px-2 py-2 text-center">
                <div className="serif text-[22px] leading-none tnum" style={{ color }}>
                  {count(k)}
                </div>
                <div className="mt-1 truncate text-[var(--muted)]">{label}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Rencana Aksi" subtitle="Centang setelah dikerjakan (tersimpan di browser ini)" className="lg:col-span-2">
          {actions.length ? (
            <ul className="space-y-2">
              {actions.map((i) => {
                const key = `${a.period.from}|${i.title}`;
                return (
                  <li key={key} className="flex items-start gap-3 rounded-lg border border-[var(--line)] p-2.5">
                    <input type="checkbox" className="mt-1" checked={!!done[key]} onChange={() => toggle(key)} aria-label="Tandai selesai" />
                    <div className={done[key] ? "text-[var(--muted)] line-through" : ""}>
                      <div className="text-[13px] font-semibold">
                        <span className={i.level === "critical" ? "text-[var(--critical-ink)]" : "text-[var(--warning-ink)]"}>{i.level === "critical" ? "● " : "○ "}</span>
                        [{i.area}] {i.action}
                      </div>
                      <div className="text-[12px] text-[var(--muted)]">{i.title}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="text-[13px] text-[var(--ink-2)]">Tidak ada masalah kritis. Lihat saran di bawah untuk peluang peningkatan.</div>
          )}
        </Card>
      </div>

      <div className="no-print">
        <AiAdvice />
      </div>

      <div className="serif mt-2 text-[20px]">Saran dari aturan tetap</div>
      <div className="flex flex-wrap gap-2 no-print">
        {LEVELS.map((l) => (
          <button key={l.key} className={`btn btn-sm ${level === l.key ? "btn-primary" : ""}`} onClick={() => setLevel(l.key)}>
            {l.label}
          </button>
        ))}
        <select className="input !h-[30px] !w-auto !text-[12.5px]" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area">
          <option value="">Semua area</option>
          {areas.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {list.map((i, idx) => (
          <InsightItem key={idx} i={i} />
        ))}
      </div>
    </div>
  );
}
