"use client";

import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";
import { useAnalytics } from "@/components/use-analytics";
import { Bars, Card, Kpi, MiniTable } from "@/components/charts";

export default function AdsPage() {
  const { data: a, reload } = useAnalytics();
  const k = a?.kpis.ads;
  const p = a?.prevKpis.ads;
  return (
    <div className="space-y-5">
      <PageHeader title="Ads Campaign" desc="Catat & pantau campaign Meta, TikTok, Google. CTR, CPC, CPM, biaya per percakapan, ROAS & ROI dihitung otomatis. Klik baris untuk edit, klik status untuk mengubah cepat." />
      {k && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8">
          <Kpi label="Campaign" value={k.campaigns} prev={p?.campaigns} format="number" hint={`${k.running} running`} />
          <Kpi label="Spend" value={k.spend} prev={p?.spend} format="money" invert />
          <Kpi label="Jangkauan" value={k.reach} prev={p?.reach} format="number" />
          <Kpi label="Frekuensi" value={k.frequency} prev={p?.frequency} format="decimal" invert />
          <Kpi label="CTR" value={k.ctr} prev={p?.ctr} format="percent" />
          <Kpi label="CPC" value={k.cpc} prev={p?.cpc} format="money" invert />
          <Kpi label="Biaya/Percakapan" value={k.costPerConv} prev={p?.costPerConv} format="money" invert />
          <Kpi label="ROAS" value={k.roas} prev={p?.roas} format="decimal" />
        </div>
      )}
      <ResourceTable resourceKey="ads" quickFilters={["platform", "objective", "status"]} computedCols={["ctr", "cpc", "cost_per_conv", "roas"]} onChanged={reload} />
      {a && a.campaigns.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Spend vs Omzet per Platform">
            <Bars data={a.byPlatform} series={[{ key: "spend", label: "Spend" }, { key: "revenue", label: "Omzet" }]} format="money" />
          </Card>
          <Card title="Biaya per Percakapan per Jenis Campaign" subtitle="Semakin rendah semakin efisien">
            <Bars data={a.byObjective.filter((o) => o.costPerConv)} series={[{ key: "costPerConv", label: "Biaya/percakapan" }]} format="money" />
          </Card>
          <Card title="Campaign Paling Efisien" subtitle="Biaya per percakapan terendah (min. 3 percakapan)">
            <MiniTable
              cols={[{ key: "name", label: "Campaign" }, { key: "platform", label: "Platform" }, { key: "conversations", label: "Perc.", format: "number" }, { key: "costPerConv", label: "Biaya/Perc.", format: "money" }, { key: "ctr", label: "CTR", format: "percent" }]}
              rows={[...a.campaigns].filter((c) => c.conversations >= 3).sort((x, y) => (x.costPerConv ?? 0) - (y.costPerConv ?? 0)).slice(0, 6)}
            />
          </Card>
          <Card title="Per Brand">
            <MiniTable
              cols={[{ key: "name", label: "Brand" }, { key: "spend", label: "Spend", format: "money" }, { key: "clicks", label: "Klik", format: "number" }, { key: "conversations", label: "Perc.", format: "number" }, { key: "costPerConv", label: "Biaya/Perc.", format: "money" }, { key: "roas", label: "ROAS", format: "decimal" }]}
              rows={a.byBrand}
            />
          </Card>
        </div>
      )}
    </div>
  );
}
