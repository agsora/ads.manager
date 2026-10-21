"use client";

import { useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { useFilter } from "@/components/providers";
import { useAnalytics } from "@/components/use-analytics";
import { Card, InsightItem, Score } from "@/components/charts";
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

  if (!a) return <div className="card p-10 text-center text-[var(--muted)]">{loading ? "Menganalisis data…" : ""}</div>;
  const areas = [...new Set(a.insights.map((i) => i.area))];
  const list = a.insights.filter((i) => (!level || i.level === level) && (!area || i.area === area));
  const actions = a.insights.filter((i) => i.level === "critical" || i.level === "warning");
  const count = (l: string) => a.insights.filter((i) => i.level === l).length;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Analisis otomatis" title="Insight & Rekomendasi" desc={`Kesimpulan otomatis dari data ads, leads, blast, konten, reputasi & influencer periode ${fmtDate(a.period.from)} – ${fmtDate(a.period.to)}. Setiap temuan disertai tindakan yang disarankan.`}>
        <a className="btn" href={`/api/report?${f.qs}`}>
          <Download size={15} /> Excel
        </a>
        <button className="btn" onClick={() => window.print()}>
          <Printer size={15} /> Cetak
        </button>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Kesehatan Marketing">
          <div className="grid grid-cols-2 gap-5">
            <Score label="Keseluruhan" value={a.scores.overall} />
            <Score label="Iklan" value={a.scores.ads} />
            <Score label="Leads & Closing" value={a.scores.leads} />
            <Score label="Konten" value={a.scores.content} />
            <Score label="Reputasi" value={a.scores.reputation} />
          </div>
          <div className="mt-5 grid grid-cols-4 gap-2 text-center text-[12px]">
            <div className="rounded-lg border border-[var(--line)] p-2"><div className="serif text-[22px] text-[var(--critical-ink)]">{count("critical")}</div>Kritis</div>
            <div className="rounded-lg border border-[var(--line)] p-2"><div className="serif text-[22px] text-[var(--warning-ink)]">{count("warning")}</div>Perhatian</div>
            <div className="rounded-lg border border-[var(--line)] p-2"><div className="serif text-[22px] text-[var(--ink-2)]">{count("info")}</div>Saran</div>
            <div className="rounded-lg border border-[var(--line)] p-2"><div className="serif text-[22px] text-[var(--good-ink)]">{count("good")}</div>Bagus</div>
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
