"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";
import { ImportDialog } from "@/components/import-dialog";
import { useAnalytics } from "@/components/use-analytics";
import { Bars, Card, Kpi, MiniTable } from "@/components/charts";
import { Chip } from "@/components/cells";
import { fmtDate, formatValue } from "@/lib/format";

export default function AdsPage() {
  const { data: a, reload } = useAnalytics();
  const [tab, setTab] = useState<"campaign" | "detail" | "analysis">("campaign");
  const [upload, setUpload] = useState(false);
  const [tick, setTick] = useState(0);
  const k = a?.kpis.ads;
  const p = a?.prevKpis.ads;
  const refresh = () => {
    reload();
    setTick((t) => t + 1);
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Iklan" title="Ads Campaign" desc="Upload file ekspor Meta Ads Manager (CSV/Excel) apa adanya — kolom dikenali otomatis, data harian digabung per campaign, dan upload ulang periode yang sama tidak membuat data dobel.">
        <button className="btn btn-accent" onClick={() => setUpload(true)}>
          <Upload size={15} /> Upload Laporan Meta Ads
        </button>
      </PageHeader>

      {k && (
        <div className="stat-grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-8">
          <Kpi label="Campaign aktif" value={k.campaigns} prev={p?.campaigns} format="number" hint={`${k.running} running`} />
          <Kpi label="Dibelanjakan" value={k.spend} prev={p?.spend} format="money" invert />
          <Kpi label="Impresi" value={k.impressions} prev={p?.impressions} format="number" />
          <Kpi label="Klik tautan" value={k.clicks} prev={p?.clicks} format="number" />
          <Kpi label="CTR" value={k.ctr} prev={p?.ctr} format="percent" />
          <Kpi label="CPC" value={k.cpc} prev={p?.cpc} format="money" invert />
          <Kpi label="Percakapan" value={k.conversations} prev={p?.conversations} format="number" />
          <Kpi label="Biaya / percakapan" value={k.costPerConv} prev={p?.costPerConv} format="money" invert />
        </div>
      )}

      <div className="tabs">
        <button className="tab" data-on={tab === "campaign"} onClick={() => setTab("campaign")}>Per campaign</button>
        <button className="tab" data-on={tab === "detail"} onClick={() => setTab("detail")}>Data harian / detail</button>
        <button className="tab" data-on={tab === "analysis"} onClick={() => setTab("analysis")}>Analisis</button>
      </div>

      {tab === "campaign" && (
        <div className="card overflow-hidden">
          {a && a.campaigns.length ? (
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Periode</th>
                    <th>Status</th>
                    <th className="text-right">Dibelanjakan</th>
                    <th className="text-right">Jangkauan*</th>
                    <th className="text-right">Impresi</th>
                    <th className="text-right">Klik</th>
                    <th className="text-right">CTR</th>
                    <th className="text-right">CPC</th>
                    <th className="text-right">Percakapan</th>
                    <th className="text-right">Biaya/Perc.</th>
                    <th className="text-right">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {a.campaigns.map((c) => (
                    <tr key={`${c.brand}|${c.platform}|${c.name}`}>
                      <td className="min-w-[220px]">
                        <div className="font-semibold">{c.name}</div>
                        <div className="text-[12px] text-[var(--muted)]">
                          {String(c.brand ?? "")} · {String(c.platform ?? "")}
                          {c.days > 1 ? ` · ${c.days} baris harian` : ""}
                        </div>
                      </td>
                      <td className="whitespace-nowrap text-[12.5px] text-[var(--ink-2)]">
                        {fmtDate(c.start_date)} – {fmtDate(c.end_date)}
                      </td>
                      <td>{c.status ? <Chip value={String(c.status)} /> : "–"}</td>
                      <td className="text-right tnum">{formatValue(c.spend, "money")}</td>
                      <td className="text-right tnum">{formatValue(c.reach, "number")}</td>
                      <td className="text-right tnum">{formatValue(c.impressions, "number")}</td>
                      <td className="text-right tnum">{formatValue(c.clicks, "number")}</td>
                      <td className="text-right tnum">{formatValue(c.ctr, "percent")}</td>
                      <td className="text-right tnum">{formatValue(c.cpc, "money")}</td>
                      <td className="text-right tnum">{formatValue(c.conversations, "number")}</td>
                      <td className="text-right tnum">{formatValue(c.costPerConv, "money")}</td>
                      <td className="text-right tnum">{formatValue(c.roas, "decimal")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-[var(--line)] px-4 py-2.5 text-[12px] text-[var(--muted)]">
                *Jangkauan dari data harian dijumlahkan, sehingga bisa lebih besar dari jangkauan unik di Meta. Angka dihitung untuk periode filter di atas.
              </p>
            </div>
          ) : (
            <div className="p-10 text-center text-[14px] text-[var(--ink-2)]">
              Belum ada campaign di periode ini.{" "}
              <button className="font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline" onClick={() => setUpload(true)}>
                Upload laporan Meta Ads
              </button>{" "}
              untuk mulai.
            </div>
          )}
        </div>
      )}

      {tab === "detail" && (
        <ResourceTable resourceKey="ads" quickFilters={["platform", "objective", "status"]} computedCols={["ctr", "cpc", "cost_per_conv", "roas"]} onChanged={reload} importPlatform="Meta" reloadKey={tick} />
      )}

      {tab === "analysis" && a && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Belanja vs omzet per platform">
            <Bars data={a.byPlatform} series={[{ key: "spend", label: "Belanja" }, { key: "revenue", label: "Omzet" }]} format="money" />
          </Card>
          <Card title="Biaya per percakapan, per jenis campaign" subtitle="Semakin rendah semakin efisien">
            <Bars data={a.byObjective.filter((o) => o.costPerConv)} series={[{ key: "costPerConv", label: "Biaya/percakapan" }]} format="money" />
          </Card>
          <Card title="Campaign paling efisien" subtitle="Biaya per percakapan terendah (min. 3 percakapan)">
            <MiniTable
              cols={[{ key: "name", label: "Campaign" }, { key: "platform", label: "Platform" }, { key: "conversations", label: "Perc.", format: "number" }, { key: "costPerConv", label: "Biaya/Perc.", format: "money" }, { key: "ctr", label: "CTR", format: "percent" }]}
              rows={[...a.campaigns].filter((c) => c.conversations >= 3).sort((x, y) => (x.costPerConv ?? 0) - (y.costPerConv ?? 0)).slice(0, 6)}
            />
          </Card>
          <Card title="Per brand">
            <MiniTable
              cols={[{ key: "name", label: "Brand" }, { key: "spend", label: "Belanja", format: "money" }, { key: "clicks", label: "Klik", format: "number" }, { key: "conversations", label: "Perc.", format: "number" }, { key: "costPerConv", label: "Biaya/Perc.", format: "money" }, { key: "roas", label: "ROAS", format: "decimal" }]}
              rows={a.byBrand}
            />
          </Card>
        </div>
      )}

      {upload && (
        <ImportDialog
          resourceKey="ads"
          defaultPlatform="Meta"
          title="Upload Laporan Meta Ads"
          onClose={() => setUpload(false)}
          onDone={refresh}
        />
      )}
    </div>
  );
}
