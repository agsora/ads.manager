"use client";

import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";
import { useAnalytics } from "@/components/use-analytics";
import { Card, Kpi, MiniTable } from "@/components/charts";

export default function InfluencersPage() {
  const { data: a, reload } = useAnalytics();
  const k = a?.kpis.influencer;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Reputasi" title="Influencer & Endorsement" desc="Catat kerjasama KOL/influencer: fee, views, engagement, leads & omzet. Biaya per engagement dan ROI dihitung otomatis untuk menentukan siapa yang layak dilanjutkan." />
      {k && (
        <div className="stat-grid">
          <Kpi label="Kerjasama" value={k.collabs} format="number" />
          <Kpi label="Total Fee" value={k.fee} format="money" />
          <Kpi label="Views" value={k.views} format="number" />
          <Kpi label="Biaya/Engagement" value={k.cpe} format="money" />
          <Kpi label="Leads" value={k.leads} format="number" />
          <Kpi label="ROI" value={k.roi} format="percent" />
        </div>
      )}
      {a && a.influencerList.length > 0 && (
        <Card title="Ranking Influencer" subtitle="Urut dari ROI tertinggi">
          <MiniTable
            cols={[{ key: "name", label: "Influencer" }, { key: "platform", label: "Platform" }, { key: "fee", label: "Fee", format: "money" }, { key: "views", label: "Views", format: "number" }, { key: "cpe", label: "Biaya/Eng.", format: "money" }, { key: "leads", label: "Leads", format: "number" }, { key: "revenue", label: "Omzet", format: "money" }, { key: "roi", label: "ROI", format: "percent" }]}
            rows={a.influencerList}
          />
        </Card>
      )}
      <ResourceTable resourceKey="influencers" quickFilters={["deal_type", "status"]} onChanged={reload} />
    </div>
  );
}
