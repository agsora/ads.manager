"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ArrowRight, Download, Lightbulb, OctagonAlert, Printer, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { api, useFetch, useFilter, useMeta, useToast } from "@/components/providers";
import { useAnalytics } from "@/components/use-analytics";
import { BarList, Card, Empty, Funnel, Kpi, MiniTable, PageSkeleton, ScoreRing, scoreTone, scoreWord, SEGMENT_COLORS, SplitBar, TrendLines } from "@/components/charts";
import { Chip } from "@/components/cells";
import { fmtDate, fmtMoney, fmtNum, fmtPct, formatValue } from "@/lib/format";
import type { Analytics, Insight } from "@/lib/analytics";
import type { StoredAdvice } from "@/lib/ai-advice";

type Tab = "ads" | "leads" | "content" | "rep" | "kpi";

/** Where each insight area is handled in the app. */
const AREA_HREF: Record<Insight["area"], string> = {
  Ads: "/ads",
  Leads: "/leads",
  "WA Blast": "/blast",
  Konten: "/content",
  Reputasi: "/reviews",
  Influencer: "/influencers",
  Budget: "/ads/budget",
  Umum: "/insights",
};
const LEVEL = {
  critical: { icon: OctagonAlert, color: "var(--critical)", label: "Kritis" },
  warning: { icon: AlertTriangle, color: "var(--warning)", label: "Perhatian" },
  info: { icon: Lightbulb, color: "var(--ink-2)", label: "Saran" },
  good: { icon: Lightbulb, color: "var(--good)", label: "Bagus" },
} as const;

export default function Dashboard() {
  const f = useFilter();
  const { session } = useMeta();
  const toast = useToast();
  const { data: a, loading, error, reload } = useAnalytics();
  const { data: ai } = useFetch<{ last: StoredAdvice | null }>("/api/ai/advice");
  const [seeding, setSeeding] = useState(false);
  const [tab, setTab] = useState<Tab | null>(null);

  const seed = async () => {
    if (!confirm("Isi workspace dengan data contoh (±75 hari) untuk mencoba dashboard? Data contoh bisa dihapus dari Pengaturan.")) return;
    setSeeding(true);
    try {
      await api("/api/demo", "POST");
      toast("Data contoh berhasil dibuat");
      reload();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setSeeding(false);
    }
  };

  if (error) return <div className="card p-4 text-[var(--critical)]">{error}</div>;
  if (!a) return loading || !error ? <PageSkeleton kpis={6} /> : null;
  const k = a.kpis;
  const p = a.prevKpis;
  const empty = !k.ads.campaigns && !k.leads.leads && !k.content.planned && !k.reviews.reviews && !k.blast.blasts && !a.reviewSummary.totalNow;

  const hasAds = k.ads.campaigns > 0 || k.ads.spend > 0;
  const hasLeads = k.leads.leads > 0;
  const hasContent = k.content.planned > 0;
  const hasRep = !!a.reviewSummary.ratingNow || k.reviews.reviews > 0;
  const hasBlast = k.blast.blasts > 0;
  const rating = k.reviews.avgRating ?? a.reviewSummary.ratingNow;

  // what to do now: critical and warning insights first, then a couple of suggestions
  const urgent = a.insights.filter((i) => i.level === "critical" || i.level === "warning");
  const todo = (urgent.length ? urgent : a.insights.filter((i) => i.level === "info")).slice(0, 4);
  const advice = ai?.last && Date.now() - new Date(ai.last.at).getTime() < 3 * 86400000 ? ai.last.advice : null;

  // the few numbers that matter, chosen from the data that exists
  const money = (label: string, v: number | null | undefined, pv: number | null | undefined, invert?: boolean, spark?: number[], hint?: string) => <Kpi key={label} label={label} value={v} prev={pv} format="money" invert={invert} spark={spark} hint={hint} />;
  const kpis: React.ReactNode[] = [];
  if (hasAds) kpis.push(money("Belanja iklan", k.ads.spend, p.ads.spend, true, a.trend.map((t) => t.spend)));
  if (hasAds) kpis.push(<Kpi key="conv" label="Percakapan dari ads" value={k.ads.conversations} prev={p.ads.conversations} format="number" spark={a.trend.map((t) => t.conversations)} />);
  if (hasAds) kpis.push(money("Biaya / percakapan", k.ads.costPerConv, p.ads.costPerConv, true));
  if (hasLeads) kpis.push(<Kpi key="leads" label="Leads WA" value={k.leads.leads} prev={p.leads.leads} format="number" spark={a.trend.map((t) => t.leads)} hint={k.leads.hot ? `${k.leads.hot} HOT` : undefined} />);
  if (hasLeads) kpis.push(<Kpi key="deal" label={a.financing.tracked ? "Akad (cair)" : "Deal"} value={a.financing.tracked ? a.financing.funnel[3].value : k.leads.deals} prev={a.financing.tracked ? null : p.leads.deals} format="number" hint={k.leads.dealRate ? `${fmtPct(k.leads.dealRate, 0)} dari leads` : undefined} />);
  if (hasLeads) kpis.push(a.financing.tracked && a.financing.costPerAkad ? money("Biaya per akad", a.financing.costPerAkad, null, true) : money("Biaya per lead", a.overall.cpl, null, true, undefined, "iklan + blast + influencer"));
  if (hasAds) kpis.push(<Kpi key="ctr" label="CTR iklan" value={k.ads.ctr} prev={p.ads.ctr} format="percent" />);
  if (hasRep && rating) kpis.push(<Kpi key="rate" label="Rating Google" value={rating} format="decimal" hint={a.reviewSummary.totalNow ? `${fmtNum(a.reviewSummary.totalNow)} ulasan` : undefined} />);
  if (hasContent) kpis.push(<Kpi key="posts" label="Konten tayang" value={k.content.posted} format="number" hint={`dari ${k.content.planned} rencana`} />);
  const shown = kpis.slice(0, 6);

  const defaultTab: Tab = hasAds ? "ads" : hasLeads ? "leads" : hasContent ? "content" : "rep";
  const cur = tab ?? defaultTab;
  const tabs: [Tab, string][] = [["ads", "Iklan & saldo"], ["leads", "Leads"], ["content", "Konten"], ["rep", "Reputasi & Blast"]];
  if (a.kpiProgress.length) tabs.push(["kpi", "Target KPI"]);

  return (
    <div className="space-y-4">
      <PageHeader eyebrow={new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} title={`${greeting()}, ${session?.name?.split(" ")[0] ?? ""}`} desc={`Ringkasan ${fmtDate(a.period.from)} – ${fmtDate(a.period.to)}${f.brand ? ` · ${f.brand}` : " · semua brand"}, dibandingkan periode yang sama sebelumnya.`}>
        <a className="btn" href={`/api/report?${f.qs}`}>
          <Download size={15} /> Laporan Excel
        </a>
        <button className="btn" onClick={() => window.print()}>
          <Printer size={15} /> Cetak / PDF
        </button>
      </PageHeader>

      {empty && (
        <div className="card flex flex-wrap items-center gap-4 border-dashed p-4">
          <Sparkles className="text-[var(--accent)]" />
          <div className="min-w-0 flex-1 text-sm">
            <b>Belum ada data di periode ini.</b> Impor file Excel/CSV di menu <Link className="font-semibold text-[var(--accent)]" href="/data">Pengaturan → Impor / Ekspor</Link>, input manual di tiap modul, atau coba dengan data contoh.
          </div>
          {session?.role !== "staff" && (
            <button className="btn btn-primary" onClick={seed} disabled={seeding}>
              {seeding ? "Membuat…" : "Isi data contoh"}
            </button>
          )}
        </div>
      )}

      {/* 1. How are we doing + what needs doing */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className="card overflow-hidden">
          <div className="flex items-center gap-4 p-4">
            <ScoreRing value={a.scores.overall} size={92} />
            <div className="min-w-0">
              <div className="eyebrow">Kesehatan marketing</div>
              <div className="serif mt-0.5 text-[22px] leading-tight">{scoreWord(a.scores.overall)}</div>
              <div className="mt-0.5 text-[12.5px] text-[var(--muted)]">
                {a.insights.filter((i) => i.level === "critical").length} kritis · {a.insights.filter((i) => i.level === "warning").length} perlu perhatian
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 border-t border-[var(--line)] sm:grid-cols-4">
            {(
              [
                ["Iklan", a.scores.ads, "/ads"],
                ["Leads & akad", a.scores.leads, "/leads"],
                ["Konten", a.scores.content, "/content"],
                ["Reputasi", a.scores.reputation, "/reviews"],
              ] as [string, number | null, string][]
            ).map(([label, v, href]) => (
              <Link key={label} href={href} className="group border-[var(--line)] p-3 transition hover:bg-[#fdfcf9] [&:not(:last-child)]:border-r max-sm:[&:nth-child(2)]:border-r-0 max-sm:[&:nth-child(-n+2)]:border-b">
                <div className="text-[12px] text-[var(--ink-2)]">{label}</div>
                <div className="serif text-[20px] leading-tight tnum">{v ?? "–"}</div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--track)]">
                  <div className="h-1 rounded-full" style={{ width: `${v ?? 0}%`, background: scoreTone(v), transition: "width .8s cubic-bezier(.2,.8,.2,1)" }} />
                </div>
                <div className="mt-1 text-[11.5px] text-[var(--muted)]">{v === null ? "isi datanya →" : scoreWord(v)}</div>
              </Link>
            ))}
          </div>
        </section>

        <section className="card p-4">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="serif text-[16px] font-medium">Perlu tindakan</h2>
            <Link href="/insights" className="text-[12.5px] font-semibold text-[var(--accent)]">
              Semua insight ({a.insights.length})
            </Link>
          </div>
          {todo.length ? (
            <ul className="divide-y divide-[var(--grid)]">
              {todo.map((i, idx) => {
                const m = LEVEL[i.level];
                const Icon = m.icon;
                const href = i.area === "Leads" && /follow/i.test(i.title) ? "/leads/followup" : AREA_HREF[i.area];
                return (
                  <li key={idx}>
                    <Link href={href} className="group flex items-start gap-2.5 py-2">
                      <Icon size={15} className="mt-0.5 shrink-0" style={{ color: m.color }} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold leading-snug">{i.title}</span>
                        <span className="line-clamp-2 text-[12.5px] leading-snug text-[var(--ink-2)]">{i.action}</span>
                      </span>
                      <ArrowRight size={14} className="mt-1 shrink-0 text-[var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--accent)]" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty text="Tidak ada yang mendesak. Semua berjalan baik." />
          )}
          {advice && (
            <Link href="/insights" className="mt-2 flex items-start gap-2 rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-[12.5px] leading-snug text-[var(--accent-ink)]">
              <Sparkles size={14} className="mt-0.5 shrink-0" />
              <span className="line-clamp-2">
                <b>Saran AI:</b> {advice.ringkasan}
              </span>
            </Link>
          )}
        </section>
      </div>

      {/* 2. The numbers that matter */}
      {shown.length > 0 && <div className="stat-grid">{shown}</div>}

      {/* 3. Trend */}
      {(hasAds || hasLeads) && (
        <div className={`grid gap-4 ${hasAds && hasLeads ? "lg:grid-cols-2" : ""}`}>
          {hasAds && (
            <Card title="Belanja iklan" subtitle={a.period.days > 62 ? "per minggu" : "per hari"}>
              <TrendLines data={a.trend} series={[{ key: "spend", label: "Belanja iklan" }]} format="money" area height={150} />
            </Card>
          )}
          {hasLeads && (
            <Card title="Leads & deal" subtitle="chat masuk dan closing">
              <TrendLines data={a.trend} series={[{ key: "leads", label: "Leads" }, { key: "deals", label: "Deal" }]} height={150} />
            </Card>
          )}
        </div>
      )}

      {/* 4. Worth a look, one topic at a time */}
      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="serif text-[16px] font-medium">Perlu dilihat</h2>
          <span className="text-[12px] text-[var(--muted)]">Rincian pendukung, pilih topik</span>
        </div>
        <div className="tabs mb-3">
          {tabs.map(([key, label]) => (
            <button key={key} className="tab" data-on={cur === key} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>
        {cur === "ads" && <AdsPanel a={a} hasAds={hasAds} />}
        {cur === "leads" && <LeadsPanel a={a} hasLeads={hasLeads} />}
        {cur === "content" && <ContentPanel a={a} hasContent={hasContent} />}
        {cur === "rep" && <RepPanel a={a} hasRep={hasRep} hasBlast={hasBlast} rating={rating} />}
        {cur === "kpi" && <KpiPanel a={a} />}
      </section>
    </div>
  );
}

function AdsPanel({ a, hasAds }: { a: Analytics; hasAds: boolean }) {
  if (!hasAds && !a.wallets.length) return <Empty text="Belum ada data iklan. Upload CSV dari Meta Ads di Iklan → Ads Campaign." />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {hasAds && (
        <Card title="Performa per platform" action={<Link href="/ads" className="text-[12.5px] font-semibold text-[var(--accent)]">Detail</Link>}>
          <MiniTable
            cols={[
              { key: "name", label: "Platform" },
              { key: "spend", label: "Belanja", format: "money" },
              { key: "ctr", label: "CTR", format: "percent" },
              { key: "conversations", label: "Perc.", format: "number" },
              { key: "costPerConv", label: "Biaya/Perc.", format: "money" },
            ]}
            rows={a.byPlatform}
            empty="Belum ada campaign"
          />
        </Card>
      )}
      <Card title="Saldo akun" action={<Link href="/ads/budget" className="text-[12.5px] font-semibold text-[var(--accent)]">Kelola</Link>}>
        {a.wallets.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {a.wallets.map((w) => {
              const pct = w.available ? Math.min(1, w.spent / w.available) : 0;
              const low = w.closing < 0 || (w.daysLeft !== null && w.daysLeft < 7);
              return (
                <div key={w.id ?? `${w.brand}${w.platform}`} className="rounded-lg border border-[var(--line)] p-2.5">
                  <div className="flex items-center justify-between gap-2 text-[12.5px]">
                    <b className="truncate">{w.brand}</b>
                    <span className="chip">{w.platform}</span>
                  </div>
                  <div className="serif mt-1 text-[18px] leading-tight tnum" style={{ color: w.closing < 0 ? "var(--critical-ink)" : undefined }}>
                    {fmtMoney(w.closing)}
                  </div>
                  <div className="mt-1.5 h-1 rounded-full bg-[var(--track)]">
                    <div className="h-1 rounded-full" style={{ width: `${pct * 100}%`, background: low ? "var(--critical)" : "var(--s1)" }} />
                  </div>
                  {w.daysLeft !== null && <div className={`mt-1 text-[11.5px] ${low ? "font-semibold text-[var(--critical-ink)]" : "text-[var(--muted)]"}`}>{low ? "⚠ " : ""}cukup ±{fmtNum(w.daysLeft, 0)} hari</div>}
                </div>
              );
            })}
          </div>
        ) : (
          <Empty text="Isi saldo awal dan top up di Iklan → Saldo & Top Up" />
        )}
      </Card>
      {hasAds && (
        <Card title="Funnel iklan" subtitle="dari impresi sampai deal" className="lg:col-span-2">
          <Funnel steps={a.funnel} />
        </Card>
      )}
    </div>
  );
}

function LeadsPanel({ a, hasLeads }: { a: Analytics; hasLeads: boolean }) {
  if (!hasLeads) return <Empty text="Belum ada leads di periode ini. Catat chat masuk di WhatsApp → WA Leads." />;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Sumber trafik" subtitle="volume dan deal">
        <BarList items={a.leadsBySource.map((s) => ({ name: s.name, value: s.leads, sub: `deal ${fmtPct(s.dealRate, 0)}` }))} sub />
      </Card>
      <Card title="Kualitas leads">
        <SplitBar parts={["HOT", "WARM", "COLD"].map((s) => ({ name: s, value: a.leadSegments.find((x) => x.name.toUpperCase() === s)?.value ?? 0 }))} colors={SEGMENT_COLORS} />
        <div className="mt-4">
          <SplitBar parts={a.leadFinal} />
        </div>
      </Card>
      <Card title="Follow up jatuh tempo" action={<Link href="/leads/followup" className="text-[12.5px] font-semibold text-[var(--accent)]">Semua ({a.followUps.length})</Link>}>
        {a.followUps.length ? (
          <ul className="divide-y divide-[var(--grid)]">
            {a.followUps.slice(0, 6).map((l) => (
              <li key={l.id} className="flex items-center gap-2 py-1.5 text-[13px]">
                {l.segment ? <Chip value={String(l.segment)} /> : null}
                <span className="min-w-0 flex-1 truncate font-medium">{String(l.name)}</span>
                <span className="text-[12px] text-[var(--muted)]">
                  FU{l.stage > 3 ? "✓" : l.stage} · {l.age} hr
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty text="Tidak ada yang jatuh tempo 🎉" />
        )}
      </Card>
    </div>
  );
}

function ContentPanel({ a, hasContent }: { a: Analytics; hasContent: boolean }) {
  const c = a.kpis.content;
  if (!hasContent && !a.upcomingContent.length) return <Empty text="Belum ada rencana konten. Susun di Konten → Content Plan." />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Pelaksanaan konten" subtitle={`${c.posted} tayang dari ${c.planned} rencana`} action={<Link href="/content" className="text-[12.5px] font-semibold text-[var(--accent)]">Kalender</Link>}>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Terlaksana" value={fmtPct(c.completionRate, 0)} />
          <Stat label="Tepat waktu" value={fmtPct(c.onTimeRate, 0)} />
          <Stat label="Rata ER" value={c.erSample >= 3 ? fmtPct(c.avgER, 2) : "–"} />
        </div>
        {c.erSample < 3 && c.posted >= 3 && <p className="mt-2 text-[12px] text-[var(--muted)]">ER baru terhitung bila minimal 3 konten punya followers dan hasil. Isi di rincian konten.</p>}
      </Card>
      <Card title="7 hari ke depan">
        {a.upcomingContent.length ? (
          <ul className="divide-y divide-[var(--grid)]">
            {a.upcomingContent.slice(0, 6).map((x) => (
              <li key={String(x.id)} className="flex items-center gap-2 py-1.5 text-[13px]">
                <span className="w-14 shrink-0 text-[12px] text-[var(--muted)] tnum">{fmtDate(x.post_date).replace(/ \d{4}$/, "")}</span>
                <span className="min-w-0 flex-1 truncate">{String(x.title)}</span>
                {x.status ? <Chip value={String(x.status)} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <Empty text="Belum ada konten terjadwal" />
        )}
      </Card>
    </div>
  );
}

function RepPanel({ a, hasRep, hasBlast, rating }: { a: Analytics; hasRep: boolean; hasBlast: boolean; rating: number | null | undefined }) {
  const k = a.kpis;
  if (!hasRep && !hasBlast && !a.events.length) return <Empty text="Belum ada data reputasi atau blast. Isi di Reputasi & Pasar → Google Business atau di Blast." />;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Google Business" action={<Link href="/reviews" className="text-[12.5px] font-semibold text-[var(--accent)]">Detail</Link>}>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Rating" value={rating ? `${fmtNum(rating, 2)}★` : "–"} />
          <Stat label="Total ulasan" value={a.reviewSummary.totalNow ? fmtNum(a.reviewSummary.totalNow) : fmtNum(k.reviews.reviews)} />
          <Stat label="Dibalas" value={k.reviews.reviews ? fmtPct(k.reviews.responseRate, 0) : "–"} />
        </div>
        {a.reviewRegions.length > 0 && (
          <ul className="mt-3 divide-y divide-[var(--grid)] text-[13px]">
            {a.reviewRegions.slice(0, 6).map((r) => (
              <li key={r.name} className="flex items-center justify-between gap-2 py-1.5">
                <span className="truncate">{r.name}</span>
                <span className="tnum text-[var(--ink-2)]">
                  {fmtNum(r.current)} ulasan{r.ratingNow ? ` · ${fmtNum(r.ratingNow, 2)}★` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="WA Blast" action={<Link href="/blast" className="text-[12.5px] font-semibold text-[var(--accent)]">Detail</Link>}>
        {hasBlast ? (
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Terkirim" value={fmtNum(k.blast.sent)} />
            <Stat label="Read rate" value={fmtPct(k.blast.readRate, 0)} />
            <Stat label="Reply rate" value={fmtPct(k.blast.replyRate, 1)} />
          </div>
        ) : (
          <Empty text="Belum ada blast di periode ini" />
        )}
      </Card>
      <Card title="Event mendatang" action={<Link href="/promo" className="text-[12.5px] font-semibold text-[var(--accent)]">Kalender</Link>}>
        {a.events.length ? (
          <ul className="text-[13px]">
            {a.events.slice(0, 5).map((e) => (
              <li key={String(e.id)} className="flex gap-2 py-1">
                <span className="w-14 shrink-0 text-[12px] text-[var(--muted)]">{fmtDate(e.event_date).replace(/ \d{4}$/, "")}</span>
                <span className="truncate">{String(e.title)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty text="Tidak ada event 30 hari ke depan" />
        )}
      </Card>
    </div>
  );
}

function KpiPanel({ a }: { a: Analytics }) {
  return (
    <Card title="Pencapaian target KPI" action={<Link href="/kpi" className="text-[12.5px] font-semibold text-[var(--accent)]">Atur target</Link>}>
      <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
        {a.kpiProgress.map((x) => {
          const pct = x.pct ?? 0;
          const ok = x.higherBetter ? pct >= 1 : pct <= 1;
          return (
            <div key={x.metric}>
              <div className="flex justify-between text-[13px]">
                <span className="font-medium">{x.metric}</span>
                <span className="tnum">
                  <b>{formatValue(x.actual, x.format)}</b> <span className="text-[var(--muted)]">/ {formatValue(x.target, x.format)}</span>
                  <span className={`ml-2 font-semibold ${ok ? "text-[var(--good-ink)]" : "text-[var(--ink-2)]"}`}>{fmtPct(pct, 0)}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-[var(--track)]">
                <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, pct * 100)}%`, background: x.higherBetter ? "var(--s1)" : pct > 1 ? "var(--critical)" : "var(--s3)" }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 18 ? "Selamat sore" : "Selamat malam";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-[var(--surface-2)] px-2 py-2">
      <div className="serif truncate text-[18px] leading-tight tnum">{value}</div>
      <div className="truncate text-[11.5px] text-[var(--muted)]">{label}</div>
    </div>
  );
}
