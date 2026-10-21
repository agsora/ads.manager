"use client";

import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";
import { useAnalytics } from "@/components/use-analytics";
import { Card, Funnel, Kpi, MiniTable } from "@/components/charts";

export default function BlastPage() {
  const { data: a, reload } = useAnalytics();
  const k = a?.kpis.blast;
  const p = a?.prevKpis.blast;
  return (
    <div className="space-y-5">
      <PageHeader title="WA Blast Report" desc="Laporan broadcast WhatsApp (Scooter, WATI, Qontak, dll): terkirim → delivered → dibaca → dibalas → leads → deal. Delivery, read, reply rate & biaya per lead dihitung otomatis." />
      {k && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-7">
          <Kpi label="Blast" value={k.blasts} prev={p?.blasts} format="number" />
          <Kpi label="Terkirim" value={k.sent} prev={p?.sent} format="number" />
          <Kpi label="Delivery Rate" value={k.deliveryRate} prev={p?.deliveryRate} format="percent" />
          <Kpi label="Read Rate" value={k.readRate} prev={p?.readRate} format="percent" />
          <Kpi label="Reply Rate" value={k.replyRate} prev={p?.replyRate} format="percent" />
          <Kpi label="Leads" value={k.leads} prev={p?.leads} format="number" />
          <Kpi label="Biaya" value={k.cost} prev={p?.cost} format="money" invert />
        </div>
      )}
      {a && a.blastList.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Funnel WA Blast">
            <Funnel steps={a.blastFunnel} />
          </Card>
          <Card title="Perbandingan Blast" subtitle="Urut dari reply rate tertinggi">
            <MiniTable
              cols={[{ key: "name", label: "Blast" }, { key: "sent", label: "Kirim", format: "number" }, { key: "replyRate", label: "Reply", format: "percent" }, { key: "leads", label: "Leads", format: "number" }, { key: "deals", label: "Deal", format: "number" }, { key: "cpl", label: "Biaya/Lead", format: "money" }]}
              rows={[...a.blastList].sort((x, y) => (y.replyRate ?? 0) - (x.replyRate ?? 0))}
            />
          </Card>
        </div>
      )}
      <ResourceTable resourceKey="blast" quickFilters={["tool", "status"]} computedCols={["delivery_rate", "read_rate", "reply_rate", "cpl"]} onChanged={reload} />
    </div>
  );
}
