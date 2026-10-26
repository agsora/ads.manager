"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";
import { useFetch } from "@/components/providers";
import { Card, MiniTable } from "@/components/charts";
import { n, type Row } from "@/lib/resources";

export default function CompetitorsPage() {
  const [tick, setTick] = useState(0);
  const { data } = useFetch<{ rows: Row[] }>(`/api/r/competitors?t=${tick}`);
  const { data: own } = useFetch<{ rows: Row[] }>("/api/r/followers");

  // our own latest followers per brand + channel, from the Followers tracker
  const ours = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of [...(own?.rows ?? [])].sort((a, b) => String(a.snapshot_date).localeCompare(String(b.snapshot_date)))) m.set(`${r.brand}|${r.channel}`, n(r.followers));
    return m;
  }, [own]);

  // latest note per competitor+channel, with the change since the note before it
  const latest = useMemo(() => {
    const groups = new Map<string, Row[]>();
    for (const r of data?.rows ?? []) {
      const key = `${r.name}|${r.channel}`;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    return [...groups.values()]
      .map((rs) => {
        const sorted = [...rs].sort((a, b) => String(b.snapshot_date).localeCompare(String(a.snapshot_date)));
        const cur = sorted[0];
        const prev = sorted.find((x) => x !== cur && n(x.followers) > 0);
        const growth = prev && n(cur.followers) ? n(cur.followers) - n(prev.followers) : null;
        const mine = cur.brand ? ours.get(`${cur.brand}|${cur.channel}`) ?? null : null;
        return {
          mine,
          gap: mine !== null && n(cur.followers) ? mine - n(cur.followers) : null,
          brand: cur.brand,
          name: cur.name,
          channel: cur.channel,
          date: cur.snapshot_date,
          followers: n(cur.followers) || null,
          growth,
          growthRate: growth !== null && prev ? growth / n(prev.followers) : null,
          posts: n(cur.posts_per_week) || null,
          promo: cur.promo,
        };
      })
      .sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0));
  }, [data, ours]);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Reputasi"
        title="Pantau Kompetitor"
        desc="Catat akun kompetitor secara berkala (misalnya tiap Senin): followers, seberapa sering posting, dan promo yang sedang mereka jalankan. Pilih brand kita di kolom Bandingkan dengan Brand, maka followers kita diambil otomatis dari Followers Tracker untuk dibandingkan."
      />
      <Card title="Kondisi terbaru" subtitle="Catatan paling baru tiap kompetitor, dengan perubahan followers sejak catatan sebelumnya">
        <MiniTable
          cols={[
            { key: "name", label: "Kompetitor" },
            { key: "channel", label: "Channel" },
            { key: "date", label: "Dicatat", format: "date" },
            { key: "followers", label: "Followers", format: "number" },
            { key: "growth", label: "Perubahan", format: "number" },
            { key: "growthRate", label: "%", format: "percent" },
            { key: "brand", label: "Dibanding" },
            { key: "mine", label: "Followers kita", format: "number" },
            { key: "gap", label: "Selisih (kita − mereka)", format: "number" },
            { key: "posts", label: "Posting/minggu", format: "number" },
            { key: "promo", label: "Promo saat ini" },
          ]}
          rows={latest}
          empty="Belum ada catatan kompetitor"
        />
      </Card>
      <ResourceTable resourceKey="competitors" ignoreDate quickFilters={["channel"]} onChanged={() => setTick((t) => t + 1)} searchPlaceholder="Cari kompetitor atau promo…" />
    </div>
  );
}
