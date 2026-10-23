"use client";

import Link from "next/link";
import { Download, Printer, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { api, useFilter, useMeta, useToast } from "@/components/providers";
import { useAnalytics } from "@/components/use-analytics";
import { BarList, Card, Empty, Funnel, InsightItem, Kpi, MiniTable, PageSkeleton, ScoreRing, scoreTone, scoreWord, SEGMENT_COLORS, SplitBar, TrendLines } from "@/components/charts";
import { ArrowRight } from "lucide-react";
import { Chip } from "@/components/cells";
import { fmtDate, fmtMoney, fmtNum, fmtPct, formatValue } from "@/lib/format";
import { useState } from "react";

export default function Dashboard() {
  const f = useFilter();
  const { session } = useMeta();
  const toast = useToast();
  const { data: a, loading, error, reload } = useAnalytics();
  const [seeding, setSeeding] = useState(false);

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

  if (error) return <div className="card p-6 text-[var(--critical)]">{error}</div>;
  if (!a) return loading || !error ? <PageSkeleton kpis={12} /> : null;
  const k = a.kpis;
  const p = a.prevKpis;
  const empty = !k.ads.campaigns && !k.leads.leads && !k.content.planned && !k.reviews.reviews && !k.blast.blasts;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} title={`${greeting()}, ${session?.name?.split(" ")[0] ?? ""}`} desc={`Ringkasan digital marketing ${fmtDate(a.period.from)} – ${fmtDate(a.period.to)}${f.brand ? ` · ${f.brand}` : " · semua brand"}, dibandingkan dengan periode yang sama sebelumnya.`}>
        <a className="btn" href={`/api/report?${f.qs}`}>
          <Download size={15} /> Laporan Excel
        </a>
        <button className="btn" onClick={() => window.print()}>
          <Printer size={15} /> Cetak / PDF
        </button>
      </PageHeader>

      {empty && (
        <div className="card flex flex-wrap items-center gap-4 border-dashed p-5">
          <Sparkles className="text-[var(--accent)]" />
          <div className="flex-1 text-sm">
            <b>Belum ada data di periode ini.</b> Impor file Excel Marketing Report Anda di menu <Link className="font-semibold text-[var(--accent)]" href="/data">Impor / Ekspor</Link>, input manual di tiap modul, atau coba dengan data contoh.
          </div>
          {session?.role !== "staff" && (
            <button className="btn btn-primary" onClick={seed} disabled={seeding}>
              {seeding ? "Membuat…" : "Isi data contoh"}
            </button>
          )}
        </div>
      )}

      <section className="card overflow-hidden">
        <div className="grid md:grid-cols-[minmax(280px,1.1fr)_2fr]">
          <div className="flex items-center gap-5 border-b border-[var(--line)] p-6 md:border-b-0 md:border-r">
            <ScoreRing value={a.scores.overall} />
            <div className="min-w-0">
              <div className="eyebrow">Kesehatan marketing</div>
              <div className="serif mt-1 text-[24px] leading-tight">{scoreWord(a.scores.overall)}</div>
              <Link href="/insights" className="mt-2 inline-flex items-center gap-1 text-[13px] text-[var(--ink-2)] hover:text-[var(--accent-ink)]">
                {(() => {
                  const crit = a.insights.filter((i) => i.level === "critical").length;
                  const warn = a.insights.filter((i) => i.level === "warning").length;
                  return crit + warn ? `${crit} kritis · ${warn} perlu perhatian` : "Tidak ada masalah mendesak";
                })()}
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4">
            {(
              [
                ["Iklan", a.scores.ads, "/ads"],
                ["Leads & closing", a.scores.leads, "/leads"],
                ["Konten", a.scores.content, "/content"],
                ["Reputasi", a.scores.reputation, "/reviews"],
              ] as [string, number | null, string][]
            ).map(([label, v, href]) => (
              <Link key={label} href={href} className="group border-[var(--line)] p-5 transition hover:bg-[#fdfcf9] [&:not(:last-child)]:border-r max-sm:[&:nth-child(2)]:border-r-0 max-sm:[&:nth-child(-n+2)]:border-b">
                <div className="text-[12.5px] text-[var(--ink-2)]">{label}</div>
                <div className="serif mt-1 text-[28px] leading-tight tnum">{v ?? "–"}</div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--track)]">
                  <div className="h-1.5 rounded-full" style={{ width: `${v ?? 0}%`, background: scoreTone(v), transition: "width .8s cubic-bezier(.2,.8,.2,1)" }} />
                </div>
                <div className="mt-1.5 text-[12px] text-[var(--muted)] group-hover:text-[var(--ink-2)]">{scoreWord(v)}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="stat-grid">
        <Kpi label="Budget Iklan Terpakai" value={k.ads.spend} prev={p.ads.spend} format="money" invert spark={a.trend.map((t) => t.spend)} />
        <Kpi label="Impresi" value={k.ads.impressions} prev={p.ads.impressions} format="number" />
        <Kpi label="CTR" value={k.ads.ctr} prev={p.ads.ctr} format="percent" />
        <Kpi label="Percakapan dari Ads" value={k.ads.conversations} prev={p.ads.conversations} format="number" spark={a.trend.map((t) => t.conversations)} />
        <Kpi label="Biaya / Percakapan" value={k.ads.costPerConv} prev={p.ads.costPerConv} format="money" invert />
        <Kpi label="ROAS" value={k.ads.roas} prev={p.ads.roas} format="decimal" hint={k.ads.roas ? "omzet ÷ biaya" : "isi omzet campaign"} />
        <Kpi label="Total Leads WA" value={k.leads.leads} prev={p.leads.leads} format="number" spark={a.trend.map((t) => t.leads)} />
        <Kpi label="Leads HOT" value={k.leads.hot} prev={p.leads.hot} format="number" />
        <Kpi label="Deal / Closing" value={k.leads.deals} prev={p.leads.deals} format="number" spark={a.trend.map((t) => t.deals)} />
        <Kpi label="Conversion Rate" value={k.leads.dealRate} prev={p.leads.dealRate} format="percent" />
        <Kpi label="Biaya per Lead (semua)" value={a.overall.cpl} format="money" hint="ads + blast + influencer" />
        <Kpi label="Nilai Deal" value={k.leads.dealValue} prev={p.leads.dealValue} format="money" />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card title="Insight & Rekomendasi Teratas" subtitle="Dihitung otomatis dari seluruh data" className="xl:col-span-1" action={<Link href="/insights" className="text-[13px] font-semibold text-[var(--accent)]">Lihat semua ({a.insights.length})</Link>}>
          <div className="space-y-2.5">
            {a.insights.slice(0, 5).map((i, idx) => (
              <InsightItem key={idx} i={i} compact />
            ))}
          </div>
        </Card>
        <div className="space-y-5 xl:col-span-2">
          <Card title="Belanja Iklan" subtitle={a.period.days > 62 ? "Per minggu" : "Per hari (dibagi rata selama durasi campaign)"}>
            <TrendLines data={a.trend} series={[{ key: "spend", label: "Belanja iklan" }]} format="money" area height={200} />
          </Card>
          <Card title="Leads & Deal" subtitle="Jumlah chat masuk dan closing">
            <TrendLines data={a.trend} series={[{ key: "leads", label: "Leads" }, { key: "deals", label: "Deal" }]} height={200} />
          </Card>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Funnel Marketing" subtitle="Dari impresi iklan sampai deal">
          <Funnel steps={a.funnel} />
        </Card>
        <Card title="Leads per Sumber Trafik" subtitle="Volume · conversion rate">
          <BarList items={a.leadsBySource.map((s) => ({ name: s.name, value: s.leads, sub: `deal ${fmtPct(s.dealRate, 0)}` }))} sub />
        </Card>
        <Card title="Kualitas Leads">
          <div className="text-[12.5px] font-semibold text-[var(--ink-2)]">Segmentasi prospek</div>
          <div className="mt-2">
            <SplitBar parts={["HOT", "WARM", "COLD"].map((s) => ({ name: s, value: a.leadSegments.find((x) => x.name.toUpperCase() === s)?.value ?? 0 }))} colors={SEGMENT_COLORS} />
          </div>
          <div className="mt-5 text-[12.5px] font-semibold text-[var(--ink-2)]">Status akhir</div>
          <div className="mt-2">
            <SplitBar parts={a.leadFinal} />
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Performa per Platform Iklan" action={<Link href="/ads" className="text-[13px] font-semibold text-[var(--accent)]">Detail</Link>}>
          <MiniTable
            cols={[
              { key: "name", label: "Platform" },
              { key: "spend", label: "Spend", format: "money" },
              { key: "ctr", label: "CTR", format: "percent" },
              { key: "cpc", label: "CPC", format: "money" },
              { key: "conversations", label: "Percakapan", format: "number" },
              { key: "costPerConv", label: "Biaya/Perc.", format: "money" },
              { key: "roas", label: "ROAS", format: "decimal" },
            ]}
            rows={a.byPlatform}
            empty="Belum ada campaign"
          />
        </Card>
        <Card title="Saldo Akun Iklan Bulan Ini" action={<Link href="/ads/budget" className="text-[13px] font-semibold text-[var(--accent)]">Kelola</Link>}>
          {a.wallets.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {a.wallets.map((w) => {
                const pct = w.available ? Math.min(1, w.spent / w.available) : 0;
                const low = w.closing < 0 || (w.daysLeft !== null && w.daysLeft < 7);
                return (
                  <div key={w.id} className="rounded-xl border border-[var(--line)] p-3">
                    <div className="flex items-center justify-between text-[13px]">
                      <b>{w.brand}</b>
                      <span className="chip">{w.platform}</span>
                    </div>
                    <div className="mt-2 text-[20px] font-bold tnum" style={{ color: w.closing < 0 ? "var(--critical)" : undefined }}>
                      {fmtMoney(w.closing)}
                    </div>
                    <div className="text-[12px] text-[var(--muted)]">
                      sisa dari {fmtMoney(w.available)} · terpakai {fmtPct(pct, 0)}
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-[var(--track)]">
                      <div className="h-1.5 rounded-full" style={{ width: `${pct * 100}%`, background: low ? "var(--critical)" : "var(--s1)" }} />
                    </div>
                    {w.daysLeft !== null && (
                      <div className={`mt-1.5 text-[12px] ${low ? "font-semibold text-[var(--critical)]" : "text-[var(--ink-2)]"}`}>
                        {low ? "⚠ " : ""}cukup ±{fmtNum(w.daysLeft, 0)} hari ({fmtMoney(w.burnPerDay)}/hari)
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty text="Isi saldo awal & top up di menu Saldo & Top Up" />
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Follow Up Jatuh Tempo" subtitle="Prioritas leads HOT" action={<Link href="/leads/followup" className="text-[13px] font-semibold text-[var(--accent)]">Semua ({a.followUps.length})</Link>}>
          {a.followUps.length ? (
            <ul className="divide-y divide-[var(--grid)]">
              {a.followUps.slice(0, 7).map((l) => (
                <li key={l.id} className="flex items-center gap-2 py-2 text-[13px]">
                  {l.segment ? <Chip value={String(l.segment)} /> : null}
                  <span className="min-w-0 flex-1 truncate font-medium">{String(l.name)}</span>
                  <span className="text-[12px] text-[var(--muted)]">FU{l.stage > 3 ? "✓" : l.stage} · {l.age} hr</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="Tidak ada follow up jatuh tempo 🎉" />
          )}
        </Card>
        <Card title="Konten" subtitle={`${k.content.posted} tayang dari ${k.content.planned} rencana`} action={<Link href="/content" className="text-[13px] font-semibold text-[var(--accent)]">Kalender</Link>}>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Terlaksana" value={fmtPct(k.content.completionRate, 0)} />
            <Stat label="Tepat waktu" value={fmtPct(k.content.onTimeRate, 0)} />
            <Stat label="Rata ER" value={fmtPct(k.content.avgER, 2)} />
          </div>
          <div className="mt-4 text-[12.5px] font-semibold text-[var(--ink-2)]">7 hari ke depan</div>
          {a.upcomingContent.length ? (
            <ul className="mt-1 divide-y divide-[var(--grid)]">
              {a.upcomingContent.slice(0, 5).map((c) => (
                <li key={String(c.id)} className="flex items-center gap-2 py-1.5 text-[13px]">
                  <span className="w-14 shrink-0 text-[12px] text-[var(--muted)] tnum">{fmtDate(c.post_date).replace(/ \d{4}$/, "")}</span>
                  <span className="min-w-0 flex-1 truncate">{String(c.title)}</span>
                  {c.status ? <Chip value={String(c.status)} /> : null}
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="Belum ada konten terjadwal" />
          )}
        </Card>
        <Card title="Reputasi & WA Blast">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Rating Google" value={k.reviews.avgRating ? `${fmtNum(k.reviews.avgRating, 2)}★` : "–"} />
            <Stat label="Ulasan" value={fmtNum(k.reviews.reviews)} />
            <Stat label="Dibalas" value={fmtPct(k.reviews.responseRate, 0)} />
            <Stat label="Blast terkirim" value={fmtNum(k.blast.sent)} />
            <Stat label="Read rate" value={fmtPct(k.blast.readRate, 0)} />
            <Stat label="Reply rate" value={fmtPct(k.blast.replyRate, 1)} />
          </div>
          {a.events.length > 0 && (
            <>
              <div className="mt-4 text-[12.5px] font-semibold text-[var(--ink-2)]">Event mendatang</div>
              <ul className="mt-1 text-[13px]">
                {a.events.slice(0, 3).map((e) => (
                  <li key={String(e.id)} className="flex gap-2 py-1">
                    <span className="w-14 shrink-0 text-[12px] text-[var(--muted)]">{fmtDate(e.event_date).replace(/ \d{4}$/, "")}</span>
                    <span className="truncate">{String(e.title)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      {a.kpiProgress.length > 0 && (
        <Card title="Pencapaian Target KPI" action={<Link href="/kpi" className="text-[13px] font-semibold text-[var(--accent)]">Atur target</Link>}>
          <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
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
                  <div className="mt-1.5 h-2 rounded-full bg-[var(--track)]">
                    <div className="h-2 rounded-full" style={{ width: `${Math.min(100, pct * 100)}%`, background: x.higherBetter ? "var(--s1)" : pct > 1 ? "var(--critical)" : "var(--s3)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 18 ? "Selamat sore" : "Selamat malam";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-[var(--surface-2)] px-2 py-2.5">
      <div className="serif truncate text-[20px] leading-tight tnum">{value}</div>
      <div className="truncate text-[11.5px] text-[var(--muted)]">{label}</div>
    </div>
  );
}
