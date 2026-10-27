"use client";

import { useMemo } from "react";
import { AlertTriangle, CircleCheck, Compass } from "lucide-react";
import { BarList, Card } from "./charts";
import { ratingColor } from "./branch-map";
import { BAND_COLORS, BranchRatingBars, ChangeBars, ImpactScatter, RegionColumns, StarDonut } from "./review-charts";
import { fmtNum } from "@/lib/format";

export interface BranchRating {
  name: string;
  branch: string;
  brand: string;
  region: string;
  current: number;
  growth: number;
  ratingNow: number | null;
  ratingChange: number | null;
  daysSince: number | null;
}
export interface RegionRating {
  name: string;
  branches: number;
  current: number;
  growth: number;
  ratingNow: number | null;
}

const label = (g: BranchRating) => g.branch || g.brand || g.name;
const r1 = (v: number) => fmtNum(v, 1);
const BANDS = [
  { star: 5, title: "5 bintang", range: "4,5 – 5,0", test: (r: number) => r >= 4.5 },
  { star: 4, title: "4 bintang", range: "3,5 – 4,4", test: (r: number) => r >= 3.5 && r < 4.5 },
  { star: 3, title: "3 bintang", range: "2,5 – 3,4", test: (r: number) => r >= 2.5 && r < 3.5 },
  { star: 2, title: "2 bintang", range: "1,5 – 2,4", test: (r: number) => r >= 1.5 && r < 2.5 },
  { star: 1, title: "1 bintang", range: "di bawah 1,5", test: (r: number) => r < 1.5 },
];

/** What an owner wants from review data: where we stand, which branches drag the rating down, which regions differ. */
export function ReviewInsights({ growth, regions, loggedStars }: { growth: BranchRating[]; regions: RegionRating[]; loggedStars: { name: string; value: number }[] }) {
  const m = useMemo(() => {
    const rated = growth.filter((g) => g.ratingNow);
    const unrated = growth.filter((g) => !g.ratingNow);
    const totalReviews = rated.reduce((t, g) => t + g.current, 0);
    const combined = totalReviews ? rated.reduce((t, g) => t + (g.ratingNow ?? 0) * g.current, 0) / totalReviews : null;
    const sorted = [...rated].sort((x, y) => (y.ratingNow ?? 0) - (x.ratingNow ?? 0) || y.current - x.current);
    // a weak branch with many reviews hurts the combined rating the most: deficit against 4.5, weighted by reviews
    const drag = rated
      .map((g) => ({ g, loss: Math.max(0, 4.5 - (g.ratingNow ?? 0)) * g.current }))
      .filter((x) => x.loss > 0)
      .sort((x, y) => y.loss - x.loss);
    const regionRated = regions.filter((r) => r.ratingNow);
    const bestRegion = [...regionRated].sort((x, y) => (y.ratingNow ?? 0) - (x.ratingNow ?? 0))[0];
    const worstRegion = [...regionRated].sort((x, y) => (x.ratingNow ?? 0) - (y.ratingNow ?? 0))[0];
    const dropped = rated.filter((g) => (g.ratingChange ?? 0) <= -0.2);
    const risen = rated.filter((g) => (g.ratingChange ?? 0) >= 0.2);
    const grew = [...growth].filter((g) => g.growth > 0).sort((x, y) => y.growth - x.growth);
    const flat = growth.filter((g) => g.growth <= 0);
    return { rated, unrated, combined, sorted, drag, regionRated, bestRegion, worstRegion, dropped, risen, grew, flat };
  }, [growth, regions]);

  if (!growth.length) return null;
  const strong = m.rated.filter((g) => (g.ratingNow ?? 0) >= 4.5).length;
  const weak = m.rated.filter((g) => (g.ratingNow ?? 0) < 4).length;

  // ---- chart data
  const bandData = [...BANDS.map((b) => ({ key: String(b.star), name: `${b.star} bintang`, value: m.rated.filter((g) => b.test(g.ratingNow ?? 0)).length })), { key: "none", name: "Belum ada rating", value: m.unrated.length }];
  const barData = m.sorted.map((g) => ({ name: label(g), rating: g.ratingNow ?? 0, reviews: g.current }));
  const regionData = [...m.regionRated]
    .sort((x, y) => (y.ratingNow ?? 0) - (x.ratingNow ?? 0))
    .map((r) => {
      const inRegion = m.rated.filter((g) => g.region === r.name).sort((x, y) => (x.ratingNow ?? 0) - (y.ratingNow ?? 0));
      const low = inRegion[0];
      const high = inRegion[inRegion.length - 1];
      return { name: r.name, rating: r.ratingNow ?? 0, branches: r.branches, reviews: r.current, low: inRegion.length > 1 && low ? `${label(low)} ${r1(low.ratingNow ?? 0)}` : undefined, high: inRegion.length > 1 && high ? `${label(high)} ${r1(high.ratingNow ?? 0)}` : undefined };
    });
  const changeData = m.rated.filter((g) => g.ratingChange).map((g) => ({ name: label(g), change: Math.round((g.ratingChange ?? 0) * 10) / 10 })).filter((d) => d.change).sort((x, y) => y.change - x.change);

  // ---- conclusions an owner can act on
  const good: string[] = [];
  const watch: string[] = [];
  const next: string[] = [];
  if (m.rated.length) good.push(`${strong} dari ${m.rated.length} cabang berating 4,5★ ke atas${m.combined ? `; rating gabungan ${r1(m.combined)}★` : ""}.`);
  if (m.bestRegion && m.regionRated.length > 1) good.push(`Wilayah terbaik: ${m.bestRegion.name} (${r1(m.bestRegion.ratingNow ?? 0)}★).`);
  if (m.grew[0]) good.push(`Ulasan paling banyak bertambah di ${label(m.grew[0])} (+${fmtNum(m.grew[0].growth)}).`);
  if (m.risen.length) good.push(`Rating naik di ${m.risen.slice(0, 3).map(label).join(", ")}.`);
  if (weak) watch.push(`${weak} cabang berating di bawah 4,0★: ${m.rated.filter((g) => (g.ratingNow ?? 0) < 4).slice(0, 4).map((g) => `${label(g)} (${r1(g.ratingNow ?? 0)})`).join(", ")}.`);
  if (m.worstRegion && m.bestRegion && m.worstRegion !== m.bestRegion && (m.bestRegion.ratingNow ?? 0) - (m.worstRegion.ratingNow ?? 0) >= 0.2) watch.push(`Wilayah ${m.worstRegion.name} paling rendah (${r1(m.worstRegion.ratingNow ?? 0)}★), selisih ${r1((m.bestRegion.ratingNow ?? 0) - (m.worstRegion.ratingNow ?? 0))} dari ${m.bestRegion.name}.`);
  if (m.dropped.length) watch.push(`Rating turun di ${m.dropped.slice(0, 3).map((g) => `${label(g)} (${fmtNum(g.ratingChange ?? 0, 1)})`).join(", ")}.`);
  if (m.unrated.length) watch.push(`${m.unrated.length} cabang belum punya rating tercatat.`);
  if (m.drag[0]) next.push(`Prioritaskan ${label(m.drag[0].g)}: ${r1(m.drag[0].g.ratingNow ?? 0)}★ dari ${fmtNum(m.drag[0].g.current)} ulasan, paling menekan rating gabungan. Balas ulasan negatif dan ajak nasabah puas memberi ulasan.`);
  if (m.flat.length && m.flat.length < growth.length) next.push(`${m.flat.length} cabang tidak menambah ulasan di periode ini: minta tim cabang mengajak nasabah menulis ulasan.`);
  if (m.drag[1]) next.push(`Setelah itu ${label(m.drag[1].g)} (${r1(m.drag[1].g.ratingNow ?? 0)}★).`);
  const col = (title: string, icon: React.ReactNode, items: string[], tone: string) => (
    <div className="min-w-0">
      <div className={`mb-1.5 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide ${tone}`}>
        {icon} {title}
      </div>
      {items.length ? (
        <ul className="space-y-1.5 text-[13px] leading-snug">
          {items.slice(0, 3).map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-[var(--muted)]">Belum ada.</p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <section className="hero">
        <div className="mb-3 serif text-[18px]">Kesimpulan reputasi</div>
        <div className="grid gap-5 md:grid-cols-3">
          {col("Berjalan baik", <CircleCheck size={14} />, good, "text-[var(--good-ink)]")}
          {col("Perlu diperhatikan", <AlertTriangle size={14} />, watch, "text-[var(--warning-ink)]")}
          {col("Langkah berikutnya", <Compass size={14} />, next, "text-[var(--accent-ink)]")}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)]">
        <Card title="Komposisi cabang per bintang" subtitle="Berapa cabang di tiap tingkat bintang">
          <StarDonut data={bandData} centerTop={m.combined ? `${r1(m.combined)}★` : "–"} centerBottom={`${m.rated.length} cabang berating`} />
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
            {bandData.map((d) => (
              <div key={d.key} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: BAND_COLORS[d.key] }} />
                <span className="min-w-0 flex-1 truncate text-[var(--ink-2)]">{d.key === "none" ? "Belum ada" : `${d.key}★`}</span>
                <b className="tnum">{d.value}</b>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Rating semua cabang" subtitle="Terbaik ke terendah; garis hijau putus-putus adalah target 4,5★">
          {barData.length ? <BranchRatingBars data={barData} /> : <p className="py-6 text-center text-[13px] text-[var(--muted)]">Belum ada rating tercatat.</p>}
        </Card>
      </div>

      <Card title="Cabang di tiap bintang" subtitle="Siapa saja yang ada di setiap tingkat bintang">
        <div className="space-y-2.5">
          {BANDS.map((b) => {
            const list = m.rated.filter((g) => b.test(g.ratingNow ?? 0)).sort((x, y) => (y.ratingNow ?? 0) - (x.ratingNow ?? 0));
            const color = ratingColor(b.star === 5 ? 4.6 : b.star === 4 ? 4.2 : 3);
            return (
              <div key={b.star} className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-3">
                <div>
                  <div className="text-[13px] font-semibold">{b.star}★ <span className="font-normal text-[var(--muted)]">{b.title.slice(2)}</span></div>
                  <div className="text-[11.5px] text-[var(--muted)]">{b.range}</div>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                      <div className="h-full rounded-full" style={{ width: `${m.rated.length ? (list.length / m.rated.length) * 100 : 0}%`, background: color }} />
                    </div>
                    <span className="tnum w-16 text-right text-[13px] font-semibold">{list.length} cabang</span>
                  </div>
                  {list.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {list.map((g) => (
                        <span key={g.name} className="chip" title={`${g.name} · ${fmtNum(g.current)} ulasan`}>
                          {label(g)} <b className="ml-1">{r1(g.ratingNow ?? 0)}</b>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {m.unrated.length > 0 && (
            <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-3">
              <div className="text-[13px] font-semibold text-[var(--muted)]">Belum ada</div>
              <div className="flex flex-wrap gap-1.5">
                {m.unrated.map((g) => (
                  <span key={g.name} className="chip">{label(g)}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card title="Peta prioritas" subtitle="Kanan = banyak ulasan, bawah = rating rendah. Cabang di area merah paling menekan rating gabungan; tangani dulu">
          {barData.length ? <ImpactScatter data={barData} /> : <p className="py-6 text-center text-[13px] text-[var(--muted)]">Belum ada rating tercatat.</p>}
        </Card>
        <Card title="Rating per wilayah" subtitle="Rata-rata tertimbang jumlah ulasan; arahkan kursor untuk cabang terendah dan tertinggi">
          {regionData.length ? <RegionColumns data={regionData} /> : <p className="py-6 text-center text-[13px] text-[var(--muted)]">Belum ada rating per wilayah.</p>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Perubahan rating" subtitle="Naik atau turun sejak awal periode (hanya cabang yang berubah)">
          {changeData.length ? <ChangeBars data={changeData} /> : <p className="py-6 text-center text-[13px] text-[var(--muted)]">Belum ada perubahan rating di periode ini. Catat ulang rekap cabang agar terlihat.</p>}
        </Card>
        <Card title="Pertambahan ulasan" subtitle="Cabang dengan ulasan baru terbanyak di periode ini">
          {m.grew.length ? <BarList items={m.grew.slice(0, 8).map((g) => ({ name: label(g), value: g.growth }))} /> : <p className="py-6 text-center text-[13px] text-[var(--muted)]">Belum ada pertambahan di periode ini. Catat ulang rekap cabang agar terlihat.</p>}
        </Card>
      </div>

      <Card title="Bintang dari ulasan yang dicatat satu per satu" subtitle="Sebaran 1 sampai 5 bintang pada ulasan di tab Daftar ulasan">
        {loggedStars.some((s) => s.value) ? <BarList items={loggedStars} /> : <p className="py-6 text-center text-[13px] text-[var(--muted)]">Belum ada ulasan yang dicatat satu per satu. Rekap per cabang di atas sudah cukup untuk gambaran umum.</p>}
      </Card>
    </div>
  );
}
