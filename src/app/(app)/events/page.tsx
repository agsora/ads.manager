"use client";

import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";

export default function EventsPage() {
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Konten" title="Event & Tanggal Penting" desc="Hari besar, promo gajian, launching, event internal. Tampil di kalender konten dan dipakai untuk rekomendasi persiapan campaign." />
      <ResourceTable resourceKey="events" ignoreDate quickFilters={["event_type"]} />
    </div>
  );
}
