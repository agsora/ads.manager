"use client";

import Link from "next/link";
import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";
import { useAnalytics } from "@/components/use-analytics";
import { BarList, Card, Kpi, KpiSkeleton, MiniTable, SEGMENT_COLORS, SplitBar } from "@/components/charts";
import { WaLinkBuilder } from "@/components/wa-link-builder";

export default function LeadsPage() {
  const { data: a, reload } = useAnalytics();
  const k = a?.kpis.leads;
  const p = a?.prevKpis.leads;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Leads" title="WA Leads" desc="Laporan chat masuk WhatsApp: sumber trafik, segmentasi HOT/WARM/COLD, follow up 1–3 (H+3, H+7, H+14), dan status akhir. Kolom 'Aksi Berikutnya' memberi tahu kapan lead harus di-follow up.">
        <Link href="/leads/followup" className="btn btn-primary">
          Buka papan Follow Up
        </Link>
      </PageHeader>
      {!k && <KpiSkeleton />}
      {k && (
        <div className="stat-grid">
          <Kpi label="Total Chat Masuk" value={k.leads} prev={p?.leads} format="number" />
          <Kpi label="HOT" value={k.hot} prev={p?.hot} format="number" />
          <Kpi label="WARM" value={k.warm} prev={p?.warm} format="number" />
          <Kpi label="COLD" value={k.cold} prev={p?.cold} format="number" />
          <Kpi label="Deal" value={k.deals} prev={p?.deals} format="number" />
          <Kpi label="Persentase Deal" value={k.dealRate} prev={p?.dealRate} format="percent" />
          <Kpi label="Ghosting" value={k.ghostRate} prev={p?.ghostRate} format="percent" invert />
          <Kpi label="Repeat Order" value={k.repeat} prev={p?.repeat} format="number" />
        </div>
      )}
      <WaLinkBuilder />
      <ResourceTable resourceKey="leads" quickFilters={["branch", "pipeline_stage", "source", "segment", "final_status"]} computedCols={["reply_minutes", "age_days", "next_action"]} onChanged={reload} />
      {a && a.kpis.leads.leads > 0 && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="Sumber Trafik" subtitle="Leads · biaya per lead (CPL)">
            <BarList items={a.leadsBySource.map((s) => ({ name: s.name, value: s.leads, sub: s.cpl ? `CPL Rp ${Math.round(s.cpl).toLocaleString("id-ID")}` : "" }))} sub />
          </Card>
          <Card title="Segmentasi & Status">
            <SplitBar parts={["HOT", "WARM", "COLD"].map((s) => ({ name: s, value: a.leadSegments.find((x) => x.name.toUpperCase() === s)?.value ?? 0 }))} colors={SEGMENT_COLORS} />
            <div className="mt-5">
              <SplitBar parts={a.leadFinal} />
            </div>
            <div className="mt-4 rounded-lg bg-[var(--surface-2)] p-3 text-[12px] text-[var(--ink-2)]">
              <b>Cold</b> = baru tanya / belum serius · <b>Warm</b> = mulai pertimbangkan, minta penawaran · <b>Hot</b> = siap deal, minta rekening/DP.
            </div>
          </Card>
          {a.attribution.length > 0 && (
            <Card title="Atribusi per kode campaign" subtitle="Dari kolom Kode Campaign" className="lg:col-span-3">
              <MiniTable
                cols={[{ key: "ref", label: "Kode" }, { key: "leads", label: "Leads", format: "number" }, { key: "hot", label: "HOT", format: "number" }, { key: "deals", label: "Deal", format: "number" }, { key: "dealValue", label: "Nilai deal", format: "money" }, { key: "spend", label: "Belanja iklan", format: "money" }, { key: "cpl", label: "Biaya/lead", format: "money" }, { key: "cpa", label: "Biaya/deal", format: "money" }, { key: "roas", label: "ROAS", format: "decimal" }]}
                rows={a.attribution}
              />
            </Card>
          )}
          <Card title="Per Brand">
            <MiniTable cols={[{ key: "name", label: "Brand" }, { key: "leads", label: "Leads", format: "number" }, { key: "hot", label: "HOT", format: "number" }, { key: "deals", label: "Deal", format: "number" }, { key: "dealRate", label: "Conv.", format: "percent" }]} rows={a.leadsByBrand} />
          </Card>
        </div>
      )}
    </div>
  );
}
