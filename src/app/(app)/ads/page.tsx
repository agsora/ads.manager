"use client";

import { useState } from "react";
import { FolderOpen, Pencil, Upload } from "lucide-react";
import { Modal } from "@/components/resource-form";
import { FileAttachments } from "@/components/file-attachments";
import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";
import { ImportDialog } from "@/components/import-dialog";
import { useAnalytics } from "@/components/use-analytics";
import { Bars, Card, Kpi, KpiSkeleton, MiniTable } from "@/components/charts";
import { Chip } from "@/components/cells";
import { fmtDate, formatValue } from "@/lib/format";
import { api, useToast } from "@/components/providers";

export default function AdsPage() {
  const { data: a, reload } = useAnalytics();
  const [tab, setTab] = useState<"campaign" | "detail" | "analysis">("campaign");
  const [upload, setUpload] = useState(false);
  const [tick, setTick] = useState(0);
  const toast = useToast();
  const [filesFor, setFilesFor] = useState<{ id: number; name: string } | null>(null);
  const k = a?.kpis.ads;
  const p = a?.prevKpis.ads;
  const refresh = () => {
    reload();
    setTick((t) => t + 1);
  };

  const setRevenue = async (c: NonNullable<typeof a>["campaigns"][number]) => {
    const input = prompt(`Total omzet dari campaign "${c.name}" (Rp, untuk seluruh periodenya):`, String(Math.round(c.rawRevenue || 0)));
    if (input === null) return;
    const want = Number(input.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(want)) return toast("Angka tidak valid", "err");
    try {
      // revenue is stored per daily row: put the difference on the latest row so the campaign total matches
      await api(`/api/r/ads/${c.latestRowId}`, "PUT", { revenue: Math.max(0, want - (c.rawRevenue - c.rawLatestRevenue)) });
      toast("Omzet campaign disimpan");
      refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Iklan" title="Ads Campaign" desc="Upload file ekspor Meta Ads Manager (CSV/Excel) apa adanya — kolom dikenali otomatis, data harian digabung per campaign, dan upload ulang periode yang sama tidak membuat data dobel.">
        <button className="btn btn-accent" onClick={() => setUpload(true)}>
          <Upload size={15} /> Upload Laporan Meta Ads
        </button>
      </PageHeader>

      {!k && <KpiSkeleton />}
      {k && (
        <div className="stat-grid">
          <Kpi label="Campaign aktif" value={k.campaigns} prev={p?.campaigns} format="number" hint={`${k.running} running`} />
          <Kpi label="Dibelanjakan" value={k.spend} prev={p?.spend} format="money" invert />
          <Kpi label="Impresi" value={k.impressions} prev={p?.impressions} format="number" />
          <Kpi label="CTR" value={k.ctr} prev={p?.ctr} format="percent" />
          <Kpi label="CPC" value={k.cpc} prev={p?.cpc} format="money" invert />
          <Kpi label="Percakapan" value={k.conversations} prev={p?.conversations} format="number" />
          <Kpi label="Biaya / percakapan" value={k.costPerConv} prev={p?.costPerConv} format="money" invert />
          <Kpi label="ROAS" value={k.roas} prev={p?.roas} format="decimal" hint="omzet ÷ biaya iklan" />
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
                    <th className="text-right">Omzet</th>
                    <th className="text-right">ROAS</th>
                    <th>File</th>
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
                      <td className="text-right tnum">
                        <button className="inline-flex items-center gap-1 hover:text-[var(--accent-ink)]" onClick={() => setRevenue(c)} title="Isi / ubah omzet campaign">
                          {c.revenue ? formatValue(c.revenue, "money") : c.attrValue ? <span title="Dari deal WA Leads bertanda kode campaign ini">{formatValue(c.attrValue, "money")}<span className="ml-1 text-[11px] text-[var(--muted)]">leads</span></span> : <span className="text-[var(--muted)]">isi</span>}
                          <Pencil size={11} className="opacity-50" />
                        </button>
                      </td>
                      <td className="text-right tnum">{c.roas ? `${formatValue(c.roas, "decimal")}x` : c.attrValue && c.spend ? `${formatValue(c.attrValue / c.spend, "decimal")}x` : "–"}</td>
                      <td>
                        <button className="btn btn-sm" onClick={() => setFilesFor({ id: Number(c.latestRowId), name: c.name })} title="File & creative campaign di Google Drive">
                          <FolderOpen size={13} /> File
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-[var(--line)] px-4 py-2.5 text-[12px] text-[var(--muted)]">
                ROAS = omzet ÷ biaya iklan (mis. 3x = tiap Rp 1 iklan menghasilkan Rp 3). Omzet diisi di kolom Omzet; jika kosong, dihitung dari deal WA Leads bersumber Ads. *Jangkauan dari data harian dijumlahkan, sehingga bisa lebih besar dari jangkauan unik di Meta. Angka dihitung untuk periode filter di atas.
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
          {a.attribution.length > 0 && (
            <Card title="Atribusi per kode campaign (WA Leads)" subtitle="Leads & deal yang bertanda kode campaign, dibanding belanja iklan" className="lg:col-span-2">
              <MiniTable
                cols={[{ key: "ref", label: "Kode" }, { key: "leads", label: "Leads", format: "number" }, { key: "deals", label: "Deal", format: "number" }, { key: "dealValue", label: "Nilai deal", format: "money" }, { key: "spend", label: "Belanja", format: "money" }, { key: "cpl", label: "Biaya/lead", format: "money" }, { key: "cpa", label: "Biaya/deal", format: "money" }, { key: "roas", label: "ROAS", format: "decimal" }]}
                rows={a.attribution}
              />
            </Card>
          )}
          <Card title="Per brand">
            <MiniTable
              cols={[{ key: "name", label: "Brand" }, { key: "spend", label: "Belanja", format: "money" }, { key: "clicks", label: "Klik", format: "number" }, { key: "conversations", label: "Perc.", format: "number" }, { key: "costPerConv", label: "Biaya/Perc.", format: "money" }, { key: "roas", label: "ROAS", format: "decimal" }]}
              rows={a.byBrand}
            />
          </Card>
        </div>
      )}

      {filesFor && (
        <Modal title={`File campaign: ${filesFor.name}`} onClose={() => setFilesFor(null)}>
          <FileAttachments resource="ads" recordId={filesFor.id} />
        </Modal>
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
