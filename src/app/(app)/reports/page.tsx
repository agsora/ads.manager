"use client";

import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { useFilter } from "@/components/providers";
import { useAnalytics } from "@/components/use-analytics";
import { Bars, BarList, Card, Funnel, InsightItem, MiniTable, SEGMENT_COLORS, SplitBar, TrendLines, PageSkeleton } from "@/components/charts";
import { fmtDate, fmtPct, formatValue } from "@/lib/format";
import type { Analytics } from "@/lib/analytics";

const REPORTS = [
  { key: "exec", label: "Ringkasan Eksekutif" },
  { key: "ads", label: "Laporan Iklan & Budget" },
  { key: "leads", label: "Laporan Leads & Penjualan" },
  { key: "content", label: "Laporan Konten" },
  { key: "blast", label: "Laporan WA Blast" },
  { key: "reputation", label: "Laporan Reputasi" },
  { key: "influencer", label: "Laporan Influencer" },
  { key: "attribution", label: "Atribusi & Efisiensi Biaya" },
] as const;
type Key = (typeof REPORTS)[number]["key"];

export default function ReportsPage() {
  const f = useFilter();
  const { data: a } = useAnalytics();
  const [tab, setTab] = useState<Key>("exec");
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Laporan" title="Laporan" desc="Laporan siap kirim ke atasan/klien. Pilih jenis laporan, atur periode & brand di bagian atas, lalu cetak (Simpan sebagai PDF) atau unduh Excel lengkap (semua laporan dalam satu file).">
        <a className="btn btn-primary" href={`/api/report?${f.qs}`}>
          <Download size={15} /> Unduh Excel Lengkap
        </a>
        <button className="btn" onClick={() => window.print()}>
          <Printer size={15} /> Cetak / PDF
        </button>
      </PageHeader>
      <div className="flex flex-wrap gap-1.5 no-print">
        {REPORTS.map((r) => (
          <button key={r.key} className={`btn btn-sm ${tab === r.key ? "btn-primary" : ""}`} onClick={() => setTab(r.key)}>
            {r.label}
          </button>
        ))}
      </div>
      {!a ? (
        <PageSkeleton kpis={4} cards={2} />
      ) : (
        <div className="space-y-4">
          <div className="card p-4">
            <div className="eyebrow">Laporan digital marketing</div>
            <div className="serif mt-0.5 text-[22px]">{REPORTS.find((r) => r.key === tab)?.label}</div>
            <div className="text-[13px] text-[var(--ink-2)]">
              Periode {fmtDate(a.period.from)} – {fmtDate(a.period.to)} · pembanding {fmtDate(a.period.prevFrom)} – {fmtDate(a.period.prevTo)} · {a.brand ?? "Semua brand"}
            </div>
          </div>
          {tab === "exec" && <Exec a={a} />}
          {tab === "ads" && <AdsReport a={a} />}
          {tab === "leads" && <LeadsReport a={a} />}
          {tab === "content" && <ContentReport a={a} />}
          {tab === "blast" && <BlastReport a={a} />}
          {tab === "reputation" && <RepReport a={a} />}
          {tab === "influencer" && <InfReport a={a} />}
          {tab === "attribution" && <Attribution a={a} />}
        </div>
      )}
    </div>
  );
}

function Compare({ rows }: { rows: { label: string; cur: number | null; prev: number | null; format: string; invert?: boolean }[] }) {
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="data">
        <thead>
          <tr>
            <th>Metrik</th>
            <th className="text-right">Periode ini</th>
            <th className="text-right">Periode lalu</th>
            <th className="text-right">Perubahan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const d = r.prev && r.cur !== null ? r.cur / r.prev - 1 : null;
            const good = d !== null && (r.invert ? d < 0 : d > 0);
            return (
              <tr key={r.label}>
                <td className="font-medium">{r.label}</td>
                <td className="text-right font-semibold tnum">{formatValue(r.cur, r.format)}</td>
                <td className="text-right text-[var(--ink-2)] tnum">{formatValue(r.prev, r.format)}</td>
                <td className={`text-right font-semibold tnum ${d === null || Math.abs(d) < 0.005 ? "text-[var(--muted)]" : good ? "text-[var(--good-ink)]" : "text-[var(--critical)]"}`}>
                  {d === null ? "–" : `${d > 0 ? "▲" : "▼"} ${fmtPct(Math.abs(d), 0)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Exec({ a }: { a: Analytics }) {
  const k = a.kpis;
  const p = a.prevKpis;
  const crit = a.insights.filter((i) => i.level === "critical" || i.level === "warning");
  const good = a.insights.filter((i) => i.level === "good");
  return (
    <>
      <Card title="Kesimpulan">
        <ul className="list-disc space-y-1.5 pl-5 text-[13.5px]">
          <li>
            Total biaya marketing <b>{formatValue(a.overall.totalCost, "money")}</b> menghasilkan <b>{k.leads.leads} leads</b> dan <b>{k.leads.deals} deal</b>
            {a.overall.cpl ? ` (biaya per lead ${formatValue(a.overall.cpl, "money")}${a.overall.cpa ? `, per deal ${formatValue(a.overall.cpa, "money")}` : ""})` : ""}.
          </li>
          <li>
            Iklan: {formatValue(k.ads.impressions, "number")} impresi, CTR {fmtPct(k.ads.ctr, 2)}, {formatValue(k.ads.conversations, "number")} percakapan
            {k.ads.roas ? `, ROAS ${formatValue(k.ads.roas, "decimal")}x` : ""}.
          </li>
          <li>Leads: conversion {fmtPct(k.leads.dealRate)}, HOT {k.leads.hot}, ghosting {fmtPct(k.leads.ghostRate)}; {a.followUps.length} lead jatuh tempo follow up.</li>
          <li>Konten: {k.content.posted}/{k.content.planned} tayang, rata-rata ER {fmtPct(k.content.avgER, 2)}.</li>
          {k.reviews.reviews > 0 && <li>Google: {k.reviews.reviews} ulasan, rating {formatValue(k.reviews.avgRating, "decimal")}★, dibalas {fmtPct(k.reviews.responseRate, 0)}.</li>}
          <li>Skor kesehatan marketing: <b>{a.scores.overall ?? "–"}/100</b>.</li>
        </ul>
      </Card>
      <Card title="Perbandingan Periode">
        <Compare
          rows={[
            { label: "Budget iklan terpakai", cur: k.ads.spend, prev: p.ads.spend, format: "money", invert: true },
            { label: "Impresi", cur: k.ads.impressions, prev: p.ads.impressions, format: "number" },
            { label: "CTR", cur: k.ads.ctr, prev: p.ads.ctr, format: "percent" },
            { label: "Percakapan dari ads", cur: k.ads.conversations, prev: p.ads.conversations, format: "number" },
            { label: "Biaya per percakapan", cur: k.ads.costPerConv, prev: p.ads.costPerConv, format: "money", invert: true },
            { label: "Total leads", cur: k.leads.leads, prev: p.leads.leads, format: "number" },
            { label: "Deal", cur: k.leads.deals, prev: p.leads.deals, format: "number" },
            { label: "Conversion rate", cur: k.leads.dealRate, prev: p.leads.dealRate, format: "percent" },
            { label: "Nilai deal", cur: k.leads.dealValue, prev: p.leads.dealValue, format: "money" },
            { label: "Konten tayang", cur: k.content.posted, prev: p.content.posted, format: "number" },
            { label: "Rata-rata ER", cur: k.content.avgER, prev: p.content.avgER, format: "percent" },
            { label: "Rating Google", cur: k.reviews.avgRating, prev: p.reviews.avgRating, format: "decimal" },
            { label: "Leads dari WA Blast", cur: k.blast.leads, prev: p.blast.leads, format: "number" },
          ]}
        />
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Yang Perlu Diperbaiki">
          <div className="space-y-2.5">{crit.length ? crit.map((i, n) => <InsightItem key={n} i={i} />) : <p className="text-[13px] text-[var(--ink-2)]">Tidak ada.</p>}</div>
        </Card>
        <Card title="Yang Sudah Bagus">
          <div className="space-y-2.5">{good.length ? good.map((i, n) => <InsightItem key={n} i={i} />) : <p className="text-[13px] text-[var(--ink-2)]">Belum ada.</p>}</div>
        </Card>
      </div>
    </>
  );
}

function AdsReport({ a }: { a: Analytics }) {
  return (
    <>
      <Card title="Tren Belanja Iklan">
        <TrendLines data={a.trend} series={[{ key: "spend", label: "Belanja" }]} format="money" area />
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Per Platform">
          <MiniTable cols={[{ key: "name", label: "Platform" }, { key: "spend", label: "Spend", format: "money" }, { key: "impressions", label: "Impresi", format: "number" }, { key: "ctr", label: "CTR", format: "percent" }, { key: "cpc", label: "CPC", format: "money" }, { key: "costPerConv", label: "Biaya/Perc.", format: "money" }, { key: "roas", label: "ROAS", format: "decimal" }]} rows={a.byPlatform} />
        </Card>
        <Card title="Per Jenis Campaign">
          <MiniTable cols={[{ key: "name", label: "Jenis" }, { key: "campaigns", label: "Jml", format: "number" }, { key: "spend", label: "Spend", format: "money" }, { key: "ctr", label: "CTR", format: "percent" }, { key: "costPerConv", label: "Biaya/Perc.", format: "money" }]} rows={a.byObjective} />
        </Card>
      </div>
      <Card title="Detail Campaign">
        <MiniTable
          cols={[{ key: "name", label: "Campaign" }, { key: "brand", label: "Brand" }, { key: "platform", label: "Platform" }, { key: "status", label: "Status" }, { key: "spend", label: "Spend", format: "money" }, { key: "reach", label: "Jangkauan", format: "number" }, { key: "frequency", label: "Frek.", format: "decimal" }, { key: "clicks", label: "Klik", format: "number" }, { key: "ctr", label: "CTR", format: "percent" }, { key: "cpc", label: "CPC", format: "money" }, { key: "conversations", label: "Perc.", format: "number" }, { key: "costPerConv", label: "Biaya/Perc.", format: "money" }, { key: "roas", label: "ROAS", format: "decimal" }]}
          rows={a.campaigns}
        />
      </Card>
      <Card title="Saldo Akun Iklan">
        <MiniTable cols={[{ key: "brand", label: "Brand" }, { key: "platform", label: "Platform" }, { key: "available", label: "Dana Tersedia", format: "money" }, { key: "spent", label: "Terpakai", format: "money" }, { key: "closing", label: "Saldo Akhir", format: "money" }, { key: "daysLeft", label: "Cukup (hari)", format: "number" }, { key: "planned", label: "Rencana Top Up", format: "money" }]} rows={a.wallets} />
      </Card>
      <Insights a={a} area={["Ads", "Budget"]} />
    </>
  );
}

function LeadsReport({ a }: { a: Analytics }) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Funnel">
          <Funnel steps={a.funnel} />
        </Card>
        <Card title="Segmentasi & Status Akhir">
          <SplitBar parts={["HOT", "WARM", "COLD"].map((s) => ({ name: s, value: a.leadSegments.find((x) => x.name.toUpperCase() === s)?.value ?? 0 }))} colors={SEGMENT_COLORS} />
          <div className="mt-5">
            <SplitBar parts={a.leadFinal} />
          </div>
        </Card>
      </div>
      <Card title="Tren Leads & Deal">
        <TrendLines data={a.trend} series={[{ key: "leads", label: "Leads" }, { key: "deals", label: "Deal" }]} />
      </Card>
      <Card title="Per Sumber Trafik">
        <MiniTable cols={[{ key: "name", label: "Sumber" }, { key: "leads", label: "Leads", format: "number" }, { key: "hot", label: "HOT", format: "number" }, { key: "deals", label: "Deal", format: "number" }, { key: "dealRate", label: "Conversion", format: "percent" }, { key: "ghost", label: "Ghosting", format: "number" }, { key: "cpl", label: "CPL", format: "money" }, { key: "cpa", label: "Biaya/Deal", format: "money" }]} rows={a.leadsBySource} />
      </Card>
      <Card title="Per Brand">
        <MiniTable cols={[{ key: "name", label: "Brand" }, { key: "leads", label: "Leads", format: "number" }, { key: "hot", label: "HOT", format: "number" }, { key: "deals", label: "Deal", format: "number" }, { key: "dealRate", label: "Conversion", format: "percent" }, { key: "dealValue", label: "Nilai Deal", format: "money" }]} rows={a.leadsByBrand} />
      </Card>
      <Card title="Follow Up Jatuh Tempo">
        <MiniTable cols={[{ key: "name", label: "Nama" }, { key: "segment", label: "Segmen" }, { key: "source", label: "Sumber" }, { key: "chat_date", label: "Tgl Chat", format: "date" }, { key: "age", label: "Umur (hari)", format: "number" }, { key: "stage", label: "FU ke-", format: "number" }]} rows={a.followUps} empty="Tidak ada" />
      </Card>
      <Insights a={a} area={["Leads"]} />
    </>
  );
}

function ContentReport({ a }: { a: Analytics }) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Per Channel">
          <MiniTable cols={[{ key: "name", label: "Channel" }, { key: "planned", label: "Rencana", format: "number" }, { key: "posted", label: "Tayang", format: "number" }, { key: "avgER", label: "Rata ER", format: "percent" }, { key: "reach", label: "Reach", format: "number" }]} rows={a.contentByChannel} />
        </Card>
        <Card title="Per Pilar">
          <MiniTable cols={[{ key: "name", label: "Pilar" }, { key: "planned", label: "Rencana", format: "number" }, { key: "posted", label: "Tayang", format: "number" }, { key: "avgER", label: "Rata ER", format: "percent" }, { key: "reach", label: "Reach", format: "number" }]} rows={a.contentByPillar} />
        </Card>
        <Card title="Top 5 Konten">
          <MiniTable cols={[{ key: "title", label: "Judul" }, { key: "channel", label: "Channel" }, { key: "er", label: "ER", format: "percent" }]} rows={a.topContent} />
        </Card>
        <Card title="Bottom 5 Konten">
          <MiniTable cols={[{ key: "title", label: "Judul" }, { key: "channel", label: "Channel" }, { key: "er", label: "ER", format: "percent" }]} rows={a.bottomContent} />
        </Card>
        <Card title="Posting per Hari">
          <Bars data={a.weekdayStats} series={[{ key: "posts", label: "Posting" }]} />
        </Card>
        <Card title="Pertumbuhan Followers">
          <MiniTable cols={[{ key: "name", label: "Akun" }, { key: "current", label: "Followers", format: "number" }, { key: "growth", label: "Tumbuh", format: "number" }, { key: "growthRate", label: "%", format: "percent" }]} rows={a.followerGrowth} />
        </Card>
      </div>
      <Insights a={a} area={["Konten"]} />
    </>
  );
}

function BlastReport({ a }: { a: Analytics }) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Funnel WA Blast">
          <Funnel steps={a.blastFunnel} />
        </Card>
        <Card title="Reply Rate per Blast">
          <BarList items={a.blastList.map((b) => ({ name: `${b.name} (${fmtDate(b.date)})`, value: b.replyRate ?? 0 }))} format="percent" />
        </Card>
      </div>
      <Card title="Detail Blast">
        <MiniTable cols={[{ key: "name", label: "Blast" }, { key: "date", label: "Tanggal", format: "date" }, { key: "sent", label: "Kirim", format: "number" }, { key: "delivered", label: "Delivered", format: "number" }, { key: "read", label: "Dibaca", format: "number" }, { key: "replied", label: "Dibalas", format: "number" }, { key: "leads", label: "Leads", format: "number" }, { key: "deals", label: "Deal", format: "number" }, { key: "cost", label: "Biaya", format: "money" }, { key: "cpl", label: "Biaya/Lead", format: "money" }]} rows={a.blastList} />
      </Card>
      <Insights a={a} area={["WA Blast"]} />
    </>
  );
}

function RepReport({ a }: { a: Analytics }) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Per Cabang" className="lg:col-span-2">
          <MiniTable cols={[{ key: "name", label: "Cabang" }, { key: "reviews", label: "Ulasan", format: "number" }, { key: "avgRating", label: "Rating", format: "decimal" }, { key: "positive", label: "Positif", format: "number" }, { key: "negative", label: "Negatif", format: "number" }, { key: "responseRate", label: "Dibalas", format: "percent" }]} rows={a.reviewsByBranch} />
        </Card>
        <Card title="Distribusi Rating">
          <BarList items={a.ratingDist} color="var(--s4)" />
        </Card>
      </div>
      <Card title="Kategori Komentar">
        <BarList items={a.reviewCategories} color="var(--s7)" />
      </Card>
      <Insights a={a} area={["Reputasi"]} />
    </>
  );
}

function InfReport({ a }: { a: Analytics }) {
  return (
    <>
      <Card title="Ranking Influencer">
        <MiniTable cols={[{ key: "name", label: "Influencer" }, { key: "platform", label: "Platform" }, { key: "fee", label: "Fee", format: "money" }, { key: "views", label: "Views", format: "number" }, { key: "engagement", label: "Engagement", format: "number" }, { key: "cpe", label: "Biaya/Eng.", format: "money" }, { key: "leads", label: "Leads", format: "number" }, { key: "revenue", label: "Omzet", format: "money" }, { key: "roi", label: "ROI", format: "percent" }]} rows={a.influencerList} />
      </Card>
      <Insights a={a} area={["Influencer"]} />
    </>
  );
}

function Attribution({ a }: { a: Analytics }) {
  const k = a.kpis;
  const channels = [
    { name: "Ads (Meta/TikTok/Google)", cost: k.ads.spend, leads: a.leadsBySource.filter((s) => /ads|google/i.test(s.name)).reduce((x, s) => x + s.leads, 0), deals: a.leadsBySource.filter((s) => /ads|google/i.test(s.name)).reduce((x, s) => x + s.deals, 0) },
    { name: "WA Blast", cost: k.blast.cost, leads: k.blast.leads, deals: k.blast.deals },
    { name: "Influencer", cost: k.influencer.fee, leads: k.influencer.leads, deals: a.leadsBySource.find((s) => /influencer/i.test(s.name))?.deals ?? 0 },
    { name: "Organik (konten/Google Maps)", cost: 0, leads: a.leadsBySource.filter((s) => /organik|story|referral|website/i.test(s.name)).reduce((x, s) => x + s.leads, 0), deals: a.leadsBySource.filter((s) => /organik|story|referral|website/i.test(s.name)).reduce((x, s) => x + s.deals, 0) },
  ].map((c) => ({ ...c, cpl: c.leads && c.cost ? c.cost / c.leads : null, cpa: c.deals && c.cost ? c.cost / c.deals : null, share: k.leads.leads ? c.leads / k.leads.leads : null }));
  return (
    <>
      <Card title="Efisiensi per Kanal" subtitle="Biaya dibanding leads & deal yang tercatat">
        <MiniTable cols={[{ key: "name", label: "Kanal" }, { key: "cost", label: "Biaya", format: "money" }, { key: "leads", label: "Leads", format: "number" }, { key: "share", label: "Porsi Leads", format: "percent" }, { key: "deals", label: "Deal", format: "number" }, { key: "cpl", label: "Biaya/Lead", format: "money" }, { key: "cpa", label: "Biaya/Deal", format: "money" }]} rows={channels} />
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Biaya per Lead per Sumber">
          <BarList items={a.leadsBySource.filter((s) => s.cpl).map((s) => ({ name: s.name, value: s.cpl ?? 0 }))} format="money" color="var(--s2)" />
        </Card>
        <Card title="Conversion per Sumber">
          <BarList items={a.leadsBySource.map((s) => ({ name: s.name, value: s.dealRate ?? 0, sub: `${s.deals}/${s.leads}` }))} format="percent" color="var(--s3)" sub />
        </Card>
      </div>
      <Insights a={a} area={["Umum", "Budget"]} />
    </>
  );
}

function Insights({ a, area }: { a: Analytics; area: string[] }) {
  const list = a.insights.filter((i) => area.includes(i.area));
  if (!list.length) return null;
  return (
    <Card title="Insight & Rekomendasi">
      <div className="grid gap-3 lg:grid-cols-2">
        {list.map((i, n) => (
          <InsightItem key={n} i={i} />
        ))}
      </div>
    </Card>
  );
}
