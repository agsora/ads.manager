"use client";

import { useState } from "react";
import { ExternalLink, MapPin, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";
import { ResourceForm } from "@/components/resource-form";
import { RESOURCE_MAP } from "@/lib/resources";
import { useAnalytics } from "@/components/use-analytics";
import { BarList, Card, Kpi, MiniTable, TrendLines } from "@/components/charts";
import { fmtDate, fmtNum } from "@/lib/format";
import { todayISO } from "@/lib/format";

export default function ReviewsPage() {
  const { data: a, reload } = useAnalytics();
  const [tab, setTab] = useState<"progress" | "list">("progress");
  const [tick, setTick] = useState(0);
  // pre-filled "record again" form for one branch
  const [recap, setRecap] = useState<Record<string, unknown> | null>(null);
  const k = a?.kpis.reviews;
  const p = a?.prevKpis.reviews;
  const growth = a?.reviewGrowth ?? [];
  const totalNow = growth.reduce((s, g) => s + g.current, 0);
  const totalStart = growth.reduce((s, g) => s + g.start, 0);
  const totalInitial = growth.reduce((s, g) => s + g.initial, 0);
  const rated = growth.filter((g) => g.ratingNow);
  const ratingNow = rated.length ? rated.reduce((s, g) => s + (g.ratingNow ?? 0) * g.current, 0) / Math.max(1, rated.reduce((s, g) => s + g.current, 0)) : null;
  const stale = growth.filter((g) => g.daysSince !== null && g.daysSince > 14).length;
  const openRecap = (g: (typeof growth)[number]) =>
    setRecap({
      snapshot_date: todayISO(),
      brand: g.brand || undefined,
      branch: g.branch || undefined,
      region: g.region !== "(Tanpa wilayah)" ? g.region : undefined,
      maps_link: g.mapsLink ?? undefined,
      total_reviews: g.current || undefined,
      avg_rating: g.ratingNow ?? undefined,
    });
  const refresh = () => {
    reload();
    setTick((t) => t + 1);
  };

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Reputasi" title="Google Business" desc="Catat jumlah total ulasan & rating tiap cabang secara berkala (isian pertama = jumlah awal), lalu lihat perkembangannya. Ulasan satu per satu tetap bisa dicatat untuk analisis sentimen & respon." />
      <div className="tabs">
        <button className="tab" data-on={tab === "progress"} onClick={() => setTab("progress")}>Rekap & perkembangan</button>
        <button className="tab" data-on={tab === "list"} onClick={() => setTab("list")}>Daftar ulasan</button>
      </div>

      {tab === "progress" && (
        <div className="space-y-4">
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

          {(a?.reviewRegions.length ?? 0) > 0 && (
            <Card title="Per wilayah" subtitle="Jumlah ulasan dan rating gabungan semua cabang di tiap wilayah">
              <MiniTable
                cols={[
                  { key: "name", label: "Wilayah" },
                  { key: "branches", label: "Cabang", format: "number" },
                  { key: "initial", label: "Jumlah awal", format: "number" },
                  { key: "current", label: "Sekarang", format: "number" },
                  { key: "growth", label: "Tumbuh", format: "number" },
                  { key: "ratingNow", label: "Rating", format: "decimal" },
                  { key: "negative", label: "Ulasan negatif", format: "number" },
                ]}
                rows={a!.reviewRegions}
              />
            </Card>
          )}

          <Card
            title="Per cabang"
            subtitle={a ? `Perkembangan ${fmtDate(a.period.from)} – ${fmtDate(a.period.to)}${stale ? ` · ${stale} cabang perlu update (lebih dari 14 hari)` : ""}` : undefined}
          >
            {growth.length ? (
              <div className="-mx-4 overflow-x-auto">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Cabang</th>
                      <th>Wilayah</th>
                      <th className="num">Awal</th>
                      <th className="num">Sekarang</th>
                      <th className="num">Tumbuh</th>
                      <th className="num">Rating</th>
                      <th>Terakhir dicatat</th>
                      <th>Google Maps</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {growth.map((g) => {
                      const old = g.daysSince !== null && g.daysSince > 14;
                      return (
                        <tr key={g.name}>
                          <td>
                            <div className="font-medium">{g.branch || g.brand || "(Kosong)"}</div>
                            {g.branch && g.brand ? <div className="text-[11.5px] text-[var(--muted)]">{g.brand}</div> : null}
                          </td>
                          <td>{g.region === "(Tanpa wilayah)" ? <span className="text-[var(--muted)]">–</span> : <span className="chip">{g.region}</span>}</td>
                          <td className="num">{fmtNum(g.initial)}</td>
                          <td className="num font-semibold">{fmtNum(g.current)}</td>
                          <td className="num">{g.growth ? `${g.growth > 0 ? "+" : ""}${fmtNum(g.growth)}` : "–"}</td>
                          <td className="num">
                            {g.ratingNow ? `${fmtNum(g.ratingNow, 1)}★` : "–"}
                            {g.ratingChange ? <span className={`ml-1 text-[11.5px] ${g.ratingChange > 0 ? "text-[var(--good-ink)]" : "text-[var(--critical-ink)]"}`}>{g.ratingChange > 0 ? "+" : ""}{fmtNum(g.ratingChange, 1)}</span> : null}
                          </td>
                          <td>
                            {g.lastDate ? fmtDate(g.lastDate) : "–"}
                            {old ? <span className="chip ml-1.5 !bg-[#f8eed6] !text-[var(--warning-ink)]">{g.daysSince} hr · perlu update</span> : null}
                          </td>
                          <td>
                            {g.mapsLink ? (
                              <a className="inline-flex items-center gap-1 text-[var(--accent-ink)] hover:underline" href={g.mapsLink} target="_blank" rel="noreferrer">
                                <MapPin size={13} /> Buka Maps <ExternalLink size={11} className="opacity-60" />
                              </a>
                            ) : (
                              <button className="inline-flex items-center gap-1 text-[var(--muted)] hover:text-[var(--accent-ink)]" onClick={() => openRecap(g)}>
                                <MapPin size={13} /> + tambah link
                              </button>
                            )}
                          </td>
                          <td className="text-right">
                            <button className="btn btn-sm" onClick={() => openRecap(g)} title="Catat total ulasan dan rating terbaru untuk cabang ini">
                              <RefreshCw size={12} /> Catat ulang
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-6 text-center text-[13px] text-[var(--muted)]">Belum ada rekap. Tambahkan rekap pertama di bawah sebagai jumlah awal.</p>
            )}
            <p className="mt-3 text-[12px] text-[var(--muted)]">
              Sekarang = rekap terakhir + ulasan yang dicatat satu per satu setelah tanggal rekap tersebut. Klik <b>Catat ulang</b>, buka link Maps cabang, lalu salin total ulasan dan rating terbarunya.
            </p>
          </Card>

          <div>
            <h2 className="serif mb-3 text-[20px]">Riwayat rekap</h2>
            <ResourceTable
              resourceKey="review_stats"
              ignoreDate
              quickFilters={["region", "branch"]}
              defaults={{ snapshot_date: todayISO() }}
              reloadKey={tick}
              onChanged={refresh}
              searchPlaceholder="Cari cabang, catatan…"
            />
          </div>
        </div>
      )}

      {tab === "list" && (
        <div className="space-y-4">
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
            <div className="grid gap-4 lg:grid-cols-3">
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
          <ResourceTable resourceKey="reviews" quickFilters={["region", "branch", "sentiment", "responded"]} onChanged={reload} />
          <p className="text-[12px] text-[var(--muted)]">Total {fmtNum(k?.reviews ?? 0)} ulasan dicatat pada periode ini.</p>
        </div>
      )}
      {recap && <ResourceForm resource={RESOURCE_MAP.review_stats} row={null} defaults={recap} onClose={() => setRecap(null)} onSaved={() => (setRecap(null), refresh())} />}
    </div>
  );
}
