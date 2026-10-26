"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";
import { useFetch } from "@/components/providers";
import { Card, Empty } from "@/components/charts";
import { addDays, fmtDate, fmtMoney, fmtNum, todayISO } from "@/lib/format";
import { n, type Row } from "@/lib/resources";

/** Days before an event when each preparation step should start. */
const PREP = [
  { lead: 7, label: "Konten teaser" },
  { lead: 5, label: "Tayang iklan" },
  { lead: 2, label: "Blast WhatsApp" },
];

export default function PromoPage() {
  const [tick, setTick] = useState(0);
  const { data: ev } = useFetch<{ rows: Row[] }>(`/api/r/events?t=${tick}`);
  const today = todayISO();

  const events = useMemo(
    () =>
      (ev?.rows ?? [])
        .filter((e) => String(e.end_date ?? e.event_date) >= addDays(today, -30))
        .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date))),
    [ev, today],
  );
  // ads + leads over the whole span of those events (7 days lead-in) so each event can be measured
  const from = events.length ? addDays(String(events[0].event_date), -7) : null;
  const to = events.length ? events.reduce((m, e) => (String(e.end_date ?? e.event_date) > m ? String(e.end_date ?? e.event_date) : m), today) : null;
  const span = from && to ? `from=${from}&to=${to}` : null;
  const { data: ads } = useFetch<{ rows: Row[] }>(span ? `/api/r/ads?${span}` : null);
  const { data: leads } = useFetch<{ rows: Row[] }>(span ? `/api/r/leads?${span}` : null);
  const { data: blasts } = useFetch<{ rows: Row[] }>(span ? `/api/r/blast?${span}` : null);
  const { data: posts } = useFetch<{ rows: Row[] }>(span ? `/api/r/content?${span}` : null);

  const rows = events.map((e) => {
    const start = addDays(String(e.event_date), -7);
    const end = String(e.end_date ?? e.event_date);
    const brandOk = (r: Row) => !e.brand || !r.brand || r.brand === e.brand;
    const adSpend = (ads?.rows ?? []).filter((r) => brandOk(r) && String(r.start_date) >= start && String(r.start_date) <= end).reduce((t, r) => t + n(r.spend), 0);
    const eb = (blasts?.rows ?? []).filter((r) => brandOk(r) && String(r.blast_date) >= start && String(r.blast_date) <= end);
    const blastCost = eb.reduce((t, r) => t + n(r.cost), 0);
    const spend = adSpend + blastCost;
    const ep = (posts?.rows ?? []).filter((r) => brandOk(r) && r.status !== "Cancel" && String(r.post_date) >= start && String(r.post_date) <= end);
    const got = (leads?.rows ?? []).filter((r) => brandOk(r) && String(r.chat_date) >= start && String(r.chat_date) <= end).length;
    const daysTo = Math.round((new Date(String(e.event_date)).getTime() - new Date(today).getTime()) / 86400000);
    const state = end < today ? "done" : String(e.event_date) <= today ? "live" : "soon";
    return { e, spend, adSpend, blastCost, blasts: eb.length, posts: ep.length, posted: ep.filter((r) => r.status === "Posted").length, got, daysTo, state, budget: n(e.planned_budget), target: n(e.target_leads) };
  });
  const upcoming = rows.filter((r) => r.state !== "done");
  const plannedTotal = upcoming.reduce((t, r) => t + r.budget, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Konten"
        title="Kalender Promo & Budget"
        desc="Hari besar, promo gajian, dan launching dipetakan bersama rencana budget iklan dan target leads, lengkap dengan jadwal persiapannya. Realisasi dihitung otomatis dari Ads Campaign, biaya WA Blast, konten, dan WA Leads (dari 7 hari sebelum event sampai event selesai)."
      />

      <div className="stat-grid">
        <div className="px-3.5 py-3">
          <div className="text-[12.5px] text-[var(--ink-2)]">Event mendatang</div>
          <div className="serif mt-0.5 text-[22px] tnum">{fmtNum(upcoming.length)}</div>
        </div>
        <div className="px-3.5 py-3">
          <div className="text-[12.5px] text-[var(--ink-2)]">Rencana budget iklan</div>
          <div className="serif mt-0.5 text-[22px] tnum">{fmtMoney(plannedTotal)}</div>
          <div className="mt-1 text-[12px] text-[var(--muted)]">Total dari event yang belum selesai</div>
        </div>
      </div>

      <Card title="Garis waktu" subtitle="Event 30 hari terakhir dan yang akan datang">
        {rows.length ? (
          <ul className="divide-y divide-[var(--line)]">
            {rows.map(({ e, spend, adSpend, blastCost, blasts: blastN, posts: postN, posted, got, daysTo, state, budget, target }) => {
              const pct = budget ? Math.min(100, (spend / budget) * 100) : 0;
              const over = budget > 0 && spend > budget;
              return (
                <li key={String(e.id)} className="grid gap-3 py-4 md:grid-cols-[150px_1fr_1fr]">
                  <div>
                    <div className="serif text-[18px] leading-tight">{fmtDate(e.event_date)}</div>
                    <div className="mt-1 text-[12.5px] text-[var(--muted)]">
                      {state === "done" ? "Selesai" : state === "live" ? "Sedang berlangsung" : daysTo === 0 ? "Hari ini" : `${daysTo} hari lagi`}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold">{String(e.title)}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {e.event_type ? <span className="chip">{String(e.event_type)}</span> : null}
                      {e.brand ? <span className="chip">{String(e.brand)}</span> : null}
                    </div>
                    {state === "soon" && (
                      <ul className="mt-2 space-y-0.5 text-[12.5px] text-[var(--ink-2)]">
                        {PREP.map((p) => {
                          const d = addDays(String(e.event_date), -p.lead);
                          return (
                            <li key={p.label} className={d < today ? "text-[var(--muted)] line-through" : ""}>
                              {fmtDate(d)} · {p.label}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <div className="min-w-0 text-[13px]">
                    {budget || target ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-[var(--ink-2)]">Biaya (iklan + blast)</span>
                          <span className="tnum">
                            {fmtMoney(spend)} / {fmtMoney(budget)}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--track)]">
                          <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: over ? "var(--critical)" : "var(--accent)" }} />
                        </div>
                        <div className="mt-2 flex justify-between">
                          <span className="text-[var(--ink-2)]">Leads</span>
                          <span className="tnum">
                            {fmtNum(got)} / {fmtNum(target)}
                          </span>
                        </div>
                        {over && <div className="mt-1 text-[12px] text-[var(--critical-ink)]">Melebihi rencana budget</div>}
                        <div className="mt-2 text-[12px] text-[var(--muted)]">
                          Iklan {fmtMoney(adSpend)} · Blast {fmtMoney(blastCost)} ({blastN}×) · Konten {posted}/{postN} tayang
                        </div>
                      </>
                    ) : (
                      <span className="text-[12.5px] text-[var(--muted)]">Belum ada rencana budget — isi lewat Edit di tabel bawah.</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty text="Belum ada event — tambahkan lewat tabel di bawah" />
        )}
      </Card>

      <ResourceTable resourceKey="events" ignoreDate quickFilters={["event_type"]} onChanged={() => setTick((t) => t + 1)} />
    </div>
  );
}
