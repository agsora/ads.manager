"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";
import { useAnalytics } from "@/components/use-analytics";
import { Card, MiniTable } from "@/components/charts";
import { Chip } from "@/components/cells";
import { fmtDate, fmtMoney, formatValue, monthStart, todayISO } from "@/lib/format";

export default function BudgetPage() {
  const { data: a, reload } = useAnalytics();
  const [tick, setTick] = useState(0);
  const history = a?.walletHistory ?? [];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Iklan" title="Saldo & Top Up Iklan" desc="Saldo terbawa antar bulan: Saldo akhir = saldo awal + top up − belanja iklan nyata (dari data campaign), dan menjadi saldo awal bulan berikutnya. Saldo awal cukup diisi sekali di bulan pertama; setelah itu catat top up saja." />

      <Card title="Posisi saldo bulan ini" subtitle="Bulan pada akhir periode filter · estimasi hari tersisa dari rata-rata belanja harian bulan berjalan">
        <MiniTable
          cols={[
            { key: "brand", label: "Brand" }, { key: "platform", label: "Platform" }, { key: "opening", label: "Saldo awal", format: "money" }, { key: "topup", label: "Top up", format: "money" },
            { key: "spent", label: "Belanja iklan", format: "money" }, { key: "closing", label: "Saldo akhir", format: "money" },
            { key: "burnPerDay", label: "Belanja/hari", format: "money" }, { key: "daysLeft", label: "Cukup (hari)", format: "number" }, { key: "planned", label: "Rencana top up", format: "money" },
          ]}
          rows={a?.wallets ?? []}
          empty="Belum ada data saldo — tambahkan saldo awal & top up di bawah"
        />
        <p className="mt-3 text-[12px] text-[var(--muted)]">Belanja iklan diambil dari Ads Campaign per brand & platform; belanja yang melintas dua bulan dibagi proporsional per hari.</p>
      </Card>

      {history.length > 0 && (
        <Card title="Riwayat saldo per bulan" subtitle="Lihat bagaimana saldo terbawa dari bulan ke bulan">
          <div className="-mx-5 overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Bulan</th><th>Brand</th><th>Platform</th>
                  <th className="text-right">Saldo awal</th><th className="text-right">Top up</th>
                  <th className="text-right">Belanja iklan</th><th className="text-right">Saldo akhir</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={`${h.brand}|${h.platform}|${h.month}`}>
                    <td className="whitespace-nowrap">{fmtDate(h.month).replace(/^\d+ /, "")}</td>
                    <td>{h.brand}</td>
                    <td><Chip value={h.platform} /></td>
                    <td className="text-right tnum">
                      {formatValue(h.opening, "money")}
                      {h.carried && <span className="ml-1.5 text-[11px] text-[var(--muted)]">terbawa</span>}
                    </td>
                    <td className="text-right tnum">{h.topup ? formatValue(h.topup, "money") : "–"}</td>
                    <td className="text-right tnum">{formatValue(h.spent, "money")}</td>
                    <td className={`text-right font-semibold tnum ${h.closing < 0 ? "text-[var(--critical-ink)]" : ""}`}>{fmtMoney(h.closing)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div>
        <h2 className="serif mb-3 text-[20px]">Catatan top up & saldo awal</h2>
        <ResourceTable
          resourceKey="wallets"
          ignoreDate
          quickFilters={["platform"]}
          defaults={{ period: monthStart(todayISO()) }}
          reloadKey={tick}
          onChanged={() => {
            reload();
            setTick((t) => t + 1);
          }}
        />
      </div>
    </div>
  );
}
