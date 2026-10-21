"use client";

import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";
import { useAnalytics } from "@/components/use-analytics";
import { BarList, Card, Kpi, MiniTable } from "@/components/charts";

export default function ReviewsPage() {
  const { data: a, reload } = useAnalytics();
  const k = a?.kpis.reviews;
  const p = a?.prevKpis.reviews;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Reputasi" title="Google Business Report" desc="Rekap ulasan Google Maps per cabang: rating, sentimen, kategori komentar dan respon admin. Ulasan negatif yang belum dibalas muncul sebagai prioritas di Insight." />
      {k && (
        <div className="stat-grid grid-cols-2 md:grid-cols-5">
          <Kpi label="Jumlah Ulasan" value={k.reviews} prev={p?.reviews} format="number" />
          <Kpi label="Rata-rata Rating" value={k.avgRating} prev={p?.avgRating} format="decimal" />
          <Kpi label="Ulasan Positif" value={k.positive} prev={p?.positive} format="number" />
          <Kpi label="Ulasan Negatif" value={k.negative} prev={p?.negative} format="number" invert />
          <Kpi label="Response Rate" value={k.responseRate} prev={p?.responseRate} format="percent" />
        </div>
      )}
      {a && a.kpis.reviews.reviews > 0 && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="Rekap per Cabang">
            <MiniTable cols={[{ key: "name", label: "Cabang" }, { key: "reviews", label: "Ulasan", format: "number" }, { key: "avgRating", label: "Rating", format: "decimal" }, { key: "negative", label: "Neg.", format: "number" }, { key: "responseRate", label: "Dibalas", format: "percent" }]} rows={a.reviewsByBranch} />
          </Card>
          <Card title="Distribusi Rating">
            <BarList items={a.ratingDist} color="var(--s4)" />
          </Card>
          <Card title="Kategori Komentar">
            <BarList items={a.reviewCategories.slice(0, 8)} color="var(--s7)" />
          </Card>
        </div>
      )}
      {a && a.unanswered.length > 0 && (
        <Card title="Belum Dibalas (60 hari terakhir)" subtitle="Urut dari rating terendah">
          <MiniTable cols={[{ key: "date", label: "Tanggal", format: "date" }, { key: "reviewer", label: "Pengulas" }, { key: "rating", label: "Rating", format: "number" }, { key: "branch", label: "Cabang" }, { key: "comment", label: "Komentar" }]} rows={a.unanswered} />
        </Card>
      )}
      <ResourceTable resourceKey="reviews" quickFilters={["branch", "sentiment", "responded"]} onChanged={reload} />
    </div>
  );
}
