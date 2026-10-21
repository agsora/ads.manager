"use client";

import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";
import { useAnalytics } from "@/components/use-analytics";
import { Card, MiniTable } from "@/components/charts";
import { monthStart, todayISO } from "@/lib/format";

export default function BudgetPage() {
  const { data: a, reload } = useAnalytics();
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Iklan" title="Saldo & Top Up Iklan" desc="Ringkasan bulanan per brand & platform. Saldo akhir dihitung otomatis: (saldo awal + top up) − budget terpakai dari data campaign. Isi 1 baris per brand/platform per bulan." />
      <Card title="Posisi Saldo (bulan pada akhir periode filter)" subtitle="Belanja/hari & estimasi hari tersisa dari rata-rata belanja bulan berjalan">
        <MiniTable
          cols={[
            { key: "brand", label: "Brand" }, { key: "platform", label: "Platform" }, { key: "opening", label: "Saldo Awal", format: "money" }, { key: "topup", label: "Top Up", format: "money" },
            { key: "available", label: "Dana Tersedia", format: "money" }, { key: "spent", label: "Terpakai", format: "money" }, { key: "closing", label: "Saldo Akhir", format: "money" },
            { key: "burnPerDay", label: "Belanja/Hari", format: "money" }, { key: "daysLeft", label: "Cukup (hari)", format: "number" }, { key: "planned", label: "Rencana Top Up", format: "money" },
          ]}
          rows={a?.wallets ?? []}
          empty="Belum ada data saldo untuk bulan ini — klik Tambah di tabel bawah"
        />
        <p className="mt-3 text-[12px] text-[var(--muted)]">ROI bulanan = ((total omzet − total budget terpakai) ÷ total budget terpakai) × 100%. Isi kolom Omzet di Ads Campaign agar ROI terhitung.</p>
      </Card>
      <ResourceTable resourceKey="wallets" ignoreDate quickFilters={["platform"]} defaults={{ period: monthStart(todayISO()) }} onChanged={reload} />
    </div>
  );
}
