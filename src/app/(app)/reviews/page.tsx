"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, MapPin, Pencil, RefreshCw } from "lucide-react";
import { PointDialog } from "@/components/point-dialog";
import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";
import { ResourceForm } from "@/components/resource-form";
import { RESOURCE_MAP } from "@/lib/resources";
import { BranchMap, ratingColor, type BranchPoint } from "@/components/branch-map";
import { api } from "@/components/providers";
import { useAnalytics } from "@/components/use-analytics";
import { BarList, Card, Kpi, MiniTable } from "@/components/charts";
import { ReviewInsights } from "@/components/review-insights";
import { fmtDate, fmtNum } from "@/lib/format";
import { todayISO } from "@/lib/format";

export default function ReviewsPage() {
  const { data: a, reload } = useAnalytics();
  const [tab, setTab] = useState<"progress" | "map" | "list">("progress");
  const [mapRegion, setMapRegion] = useState("");
  const resolved = useRef<Set<string>>(new Set());
  const [tick, setTick] = useState(0);
  // pre-filled "record again" form for one branch
  const [recap, setRecap] = useState<Record<string, unknown> | null>(null);
  const k = a?.kpis.reviews;
  const p = a?.prevKpis.reviews;
  const growth = useMemo(() => a?.reviewGrowth ?? [], [a]);
  const [pointFor, setPointFor] = useState<(typeof growth)[number] | null>(null); // branch whose exact map point is being typed
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
  // branches with a Maps link but no exact point yet: read the point from the link once, then reload
  useEffect(() => {
    if (tab !== "map") return;
    const todo = growth.filter((g) => g.mapsLink && (!g.point || g.point.approx) && !resolved.current.has(g.name));
    if (!todo.length) return;
    todo.forEach((g) => resolved.current.add(g.name));
    Promise.allSettled(todo.slice(0, 8).map((g) => api("/api/geo/resolve", "POST", { link: g.mapsLink, brand: g.brand, branch: g.branch }))).then((r) => {
      if (r.some((x) => x.status === "fulfilled")) reload();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, growth.length]);
  const allPoints: BranchPoint[] = useMemo(
    () =>
      growth
        .filter((g) => g.point)
        .map((g) => ({ id: g.name, name: g.branch || g.brand || "(Kosong)", brand: g.brand, region: g.region, lat: g.point!.lat, lng: g.point!.lng, approx: g.point!.approx, rating: g.ratingNow, reviews: g.current, lastDate: g.lastDate, mapsLink: g.mapsLink })),
    [growth],
  );
  const points = allPoints.filter((p) => !mapRegion || p.region === mapRegion);
  const noPoint = growth.filter((g) => !g.point);
  const approxCount = allPoints.filter((p) => p.approx).length;
  const regionNames = [...new Set(allPoints.map((p) => p.region))].filter((r) => r !== "(Tanpa wilayah)");
  const refresh = () => {
    reload();
    setTick((t) => t + 1);
  };

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Reputasi" title="Google Business" desc="Catat jumlah total ulasan & rating tiap cabang secara berkala (isian pertama = jumlah awal), lalu lihat perkembangannya. Ulasan satu per satu tetap bisa dicatat untuk analisis sentimen & respon." />
      <div className="tabs">
        <button className="tab" data-on={tab === "progress"} onClick={() => setTab("progress")}>Rekap & perkembangan</button>
        <button className="tab" data-on={tab === "map"} onClick={() => setTab("map")}>Peta cabang</button>
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

          {a && <ReviewInsights growth={growth} regions={a.reviewRegions} loggedStars={a.ratingDist} />}

          {(a?.reviewRegions.length ?? 0) > 0 && (
            <Card title="Rincian per wilayah" subtitle="Jumlah ulasan dan pertumbuhan semua cabang di tiap wilayah">
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
                      <th>Titik peta</th>
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
                          <td>
                            <button className="inline-flex items-center gap-1 text-left hover:text-[var(--accent-ink)]" onClick={() => setPointFor(g)} title="Atur titik cabang di peta">
                              {g.point && !g.point.approx ? (
                                <span className="tnum text-[12px]">{g.point.lat.toFixed(4)}, {g.point.lng.toFixed(4)}</span>
                              ) : (
                                <span className="chip !bg-[#f8eed6] !text-[var(--warning-ink)]">{g.point ? "perkiraan" : "belum ada"}</span>
                              )}
                              <Pencil size={11} className="opacity-60" />
                            </button>
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

      {tab === "map" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button className={`btn btn-sm ${!mapRegion ? "btn-primary" : ""}`} onClick={() => setMapRegion("")}>
                Semua wilayah ({allPoints.length})
              </button>
              {regionNames.map((r) => (
                <button key={r} className={`btn btn-sm ${mapRegion === r ? "btn-primary" : ""}`} onClick={() => setMapRegion(r)}>
                  {r} ({allPoints.filter((p) => p.region === r).length})
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[12px] text-[var(--ink-2)]">
              {[
                ["4,5★ ke atas", ratingColor(4.6)],
                ["4,0 – 4,4★", ratingColor(4.2)],
                ["di bawah 4,0★", ratingColor(3.5)],
                ["belum ada rating", ratingColor(null)],
              ].map(([label, color]) => (
                <span key={label} className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                  {label}
                </span>
              ))}
              <span className="text-[var(--muted)]">ukuran = jumlah ulasan</span>
            </div>
          </div>
          {points.length ? (
            <BranchMap points={points} height={460} />
          ) : (
            <div className="card grid h-48 place-items-center p-4 text-center text-[13px] text-[var(--muted)]">Belum ada cabang yang bisa ditampilkan. Tambahkan rekap dengan nama cabang atau link Google Maps.</div>
          )}
          {approxCount > 0 && (
            <p className="text-[12.5px] leading-relaxed text-[var(--ink-2)]">
              <b>{approxCount} titik masih perkiraan</b> (pusat kota, tampak lebih pudar). Isi <b>Link Google Maps cabang</b> agar dibaca otomatis, atau klik cabangnya untuk mengisi latitude dan longitude sendiri:
              <span className="mt-1.5 flex flex-wrap gap-1.5">
                {growth.filter((g) => g.point?.approx).map((g) => (
                  <button key={g.name} className="chip hover:!bg-[var(--accent-soft)]" onClick={() => setPointFor(g)}>
                    <Pencil size={10} className="mr-1" /> {g.branch || g.brand}
                  </button>
                ))}
              </span>
            </p>
          )}
          {noPoint.length > 0 && (
            <p className="text-[12.5px] leading-relaxed text-[var(--ink-2)]">
              Belum punya titik: <b>{noPoint.map((g) => g.branch || g.brand).join(", ")}</b>. Namanya tidak dikenali, jadi tambahkan link Google Maps atau isi koordinatnya lewat tabel Per cabang (kolom Titik peta).
            </p>
          )}
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
      {pointFor && <PointDialog name={pointFor.branch || pointFor.brand || pointFor.name} recapId={pointFor.recapId} current={pointFor.point && !pointFor.point.approx ? { lat: pointFor.point.lat, lng: pointFor.point.lng } : null} onClose={() => setPointFor(null)} onSaved={refresh} />}
    </div>
  );
}
