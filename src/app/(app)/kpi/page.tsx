"use client";

import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";
import { monthStart, todayISO } from "@/lib/format";

export default function KpiPage() {
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Konten" title="Target KPI Bulanan" desc="Atur target per brand per bulan (posting, ER, leads, deal, omzet, budget iklan, maks. biaya per lead, rating Google). Dashboard menampilkan progres aktual vs target dan memberi peringatan pacing budget." />
      <ResourceTable resourceKey="kpi" ignoreDate defaults={{ period: monthStart(todayISO()) }} />
    </div>
  );
}
