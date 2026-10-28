"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";
import { useAnalytics } from "@/components/use-analytics";
import { Card, MiniTable } from "@/components/charts";
import { api, useToast } from "@/components/providers";

export default function FollowersPage() {
  const { data: a, reload } = useAnalytics();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  const update = async () => {
    setBusy(true);
    try {
      const r = await api<{ updated: number; errors: string[] }>("/api/followers/sync", "POST");
      if (r.errors.length) toast(r.errors[0], "err");
      else toast(`Followers ${r.updated} akun diperbarui dari Instagram`);
      reload();
      setTick((t) => t + 1);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Konten" title="Followers Tracker" desc="Followers akun Instagram dibaca otomatis lewat API setiap jam 06:00 WIB. Awal = tanggal 1 bulan ini, Terbaru = pembacaan terakhir. Pertumbuhan dihitung otomatis.">
        <button className="btn btn-accent" onClick={update} disabled={busy}>
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> {busy ? "Memperbarui…" : "Update sekarang"}
        </button>
      </PageHeader>
      <Card title="Pertumbuhan Followers di Periode Ini">
        <MiniTable
          cols={[{ key: "name", label: "Akun" }, { key: "start", label: "Awal", format: "number" }, { key: "current", label: "Terbaru", format: "number" }, { key: "growth", label: "Tumbuh", format: "number" }, { key: "growthRate", label: "%", format: "percent" }, { key: "updatedAt", label: "Update terakhir", format: "date" }]}
          rows={a?.followerGrowth ?? []}
          empty="Belum ada snapshot followers"
        />
      </Card>
      <ResourceTable key={tick} resourceKey="followers" quickFilters={["channel"]} onChanged={reload} />
    </div>
  );
}
