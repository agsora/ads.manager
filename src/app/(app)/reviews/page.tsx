"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";
import { useAnalytics } from "@/components/use-analytics";
import { BarList, Card, Kpi, MiniTable, TrendLines } from "@/components/charts";
import { fmtDate, fmtNum } from "@/lib/format";
import { todayISO } from "@/lib/format";

export default function ReviewsPage() {
  const { data: a, reload } = useAnalytics();
  const [tab, setTab] = useState<"progress" | "list">("progress");
  const [tick, setTick] = useState(0);
  const k = a?.kpis.reviews;
  const p = a?.prevKpis.reviews;
  const growth = a?.reviewGrowth ?? [];
  const totalNow = growth.reduce((s, g) => s + g.current, 0);
  const totalStart = growth.reduce((s, g) => s + g.start, 0);
  const totalInitial = growth.reduce((s, g) => s + g.initial, 0);
  const rated = growth.filter((g) => g.ratingNow);
  const ratingNow = rated.length ? rated.reduce((s, g) => s + (g.ratingNow ?? 0) * g.current, 0) / Math.max(1, rated.reduce((s, g) => s + g.current, 0)) : null;
  const refresh = () => {
    reload();
    setTick((t) => t + 1);
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Reputasi" title="Google Business" desc="Catat jumlah total ulasan & rating tiap cabang secara berkala (isian pertama = jumlah awal), lalu lihat perkembangannya. Ulasan satu per satu tetap bisa dicatat untuk analisis sentimen & respon." />
      <div className="tabs">
        <button className="tab" data-on={tab === "progress"} onClick={() => setTab("progress")}>Rekap & perkembangan</button>
        <button className="tab" data-on={tab === "list"} onClick={() => setTab("list")}>Daftar ulasan</button>
      </div>

      {tab === "progress" && (
        <div className="space-y-6">
          <div className="stat-grid">
            <Kpi label="Total ulasan sekarang" value={totalNow || null} format="number" />
            <Kpi label="Jumlah awal" value={totalInitial || null} format="number" hint="snapshot pertama" />
            <Kpi label="Tumbuh di periode" value={growth.length ? totalNow - totalStart : null} format="number" hint="vs awal periode" />
            <Kpi label="Rating gabungan" value={ratingNow} format="decimal" hint="rata-rata tertimbang" />
          </div>

          {growth.length > 0 && a && a.reviewTrend.length > 1 && (
            <Card title="Perkembangan jumlah ulasan" subtitle="Per cabang, dari rekap yang dicatat">
              <TrendLines data={a.reviewTrend} series={a.reviewTrendSeries.map((name) => ({ key: name, label: name }))} />
            </Card>
          )}
          {growth.length > 0 && a && a.reviewTrend.length > 1 && (
            <Card title="Perkembangan rating">
              <TrendLines
                data={a.reviewTrend.map((t) => Object.fromEntries(Object.entries(t).map(([key, v]) => [key.endsWith("__rating") ? key.replace("__rating", "") : key === "date" ? key : `x_${key}`, v])))}
                series={a.reviewTrendSeries.map((name) => ({ key: name, label: name }))}
                decimals
              />
            </Card>
          )}

          <Card title="Perkembangan per cabang" subtitle={a ? `Periode ${fmtDate(a.period.from)} – ${fmtDate(a.period.to)}` : undefined}>
            <MiniTable
              cols={[
                { key: "name", label: "Cabang" },
                { key: "initial", label: "Jumlah awal", format: "number" },
                { key: "start", label: "Awal periode", format: "number" },
                { key: "current", label: "Sekarang", format: "number" },
                { key: "growth", label: "Tumbuh", format: "number" },
                { key: "ratingStart", label: "Rating awal", format: "decimal" },
                { key: "ratingNow", label: "Rating kini", format: "decimal" },
                { key: "ratingChange", label: "Selisih", format: "decimal" },
              ]}
              rows={growth}
              empty="Belum ada rekap. Tambahkan rekap pertama di bawah sebagai jumlah awal."
            />
            <p className="mt-3 text-[12px] text-[var(--muted)]">
              Sekarang = rekap terakhir + ulasan yang dicatat satu per satu setelah tanggal rekap tersebut.
            </p>
          </Card>

          <div>
            <h2 className="serif mb-3 text-[20px]">Riwayat rekap</h2>
            <ResourceTable
              resourceKey="review_stats"
              ignoreDate
              quickFilters={["branch"]}
              defaults={{ snapshot_date: todayISO() }}
              reloadKey={tick}
              onChanged={refresh}
              searchPlaceholder="Cari cabang, catatan…"
            />
          </div>
        </div>
      )}

      {tab === "list" && (
        <div className="space-y-6">
          {k && (
            <div className="stat-grid">
              <Kpi label="Ulasan dicatat" value={k.reviews} prev={p?.reviews} format="number" />
              <Kpi label="Rata-rata rating" value={k.avgRating} prev={p?.avgRating} format="decimal" />
              <Kpi label="Positif" value={k.positive} prev={p?.positive} format="number" />
              <Kpi label="Negatif" value={k.negative} prev={p?.negative} format="number" invert />
              <Kpi label="Response rate" value={k.responseRate} prev={p?.responseRate} format="percent" />
            </div>
          )}
          {a && a.kpis.reviews.reviews > 0 && (
            <div className="grid gap-5 lg:grid-cols-3">
              <Card title="Per cabang">
                <MiniTable cols={[{ key: "name", label: "Cabang" }, { key: "reviews", label: "Ulasan", format: "number" }, { key: "avgRating", label: "Rating", format: "decimal" }, { key: "negative", label: "Neg.", format: "number" }, { key: "responseRate", label: "Dibalas", format: "percent" }]} rows={a.reviewsByBranch} />
              </Card>
              <Card title="Distribusi rating">
                <BarList items={a.ratingDist} color="var(--s4)" />
              </Card>
              <Card title="Kategori komentar">
                <BarList items={a.reviewCategories.slice(0, 8)} color="var(--s5)" />
              </Card>
            </div>
          )}
          {a && a.unanswered.length > 0 && (
            <Card title="Belum dibalas (60 hari terakhir)" subtitle="Urut dari rating terendah">
              <MiniTable cols={[{ key: "date", label: "Tanggal", format: "date" }, { key: "reviewer", label: "Pengulas" }, { key: "rating", label: "Rating", format: "number" }, { key: "branch", label: "Cabang" }, { key: "comment", label: "Komentar" }]} rows={a.unanswered} />
            </Card>
          )}
          <ResourceTable resourceKey="reviews" quickFilters={["branch", "sentiment", "responded"]} onChanged={reload} />
          <p className="text-[12px] text-[var(--muted)]">Total {fmtNum(k?.reviews ?? 0)} ulasan dicatat pada periode ini.</p>
        </div>
      )}
    </div>
  );
}
