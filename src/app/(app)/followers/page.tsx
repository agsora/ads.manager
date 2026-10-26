"use client";

import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";
import { useAnalytics } from "@/components/use-analytics";
import { Card, MiniTable } from "@/components/charts";

export default function FollowersPage() {
  const { data: a, reload } = useAnalytics();
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Konten" title="Followers Tracker" desc="Catat jumlah followers tiap akun secara berkala (mis. tiap Senin). Pertumbuhan dihitung otomatis." />
      <Card title="Pertumbuhan Followers di Periode Ini">
        <MiniTable
          cols={[{ key: "name", label: "Akun" }, { key: "start", label: "Awal", format: "number" }, { key: "current", label: "Terbaru", format: "number" }, { key: "growth", label: "Tumbuh", format: "number" }, { key: "growthRate", label: "%", format: "percent" }]}
          rows={a?.followerGrowth ?? []}
          empty="Belum ada snapshot followers"
        />
      </Card>
      <ResourceTable resourceKey="followers" quickFilters={["channel"]} onChanged={reload} />
    </div>
  );
}
