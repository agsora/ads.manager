"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { useFetch, useFilter, useToast } from "@/components/providers";
import { Card, Empty } from "@/components/charts";
import { ComplianceHint } from "@/components/field-hints";
import { addDays, fmtMoney, fmtNum, todayISO } from "@/lib/format";
import { normPhone } from "@/lib/phone";
import { n, type Row } from "@/lib/resources";

const DEFAULT_TEMPLATE =
  "Halo Bapak/Ibu {nama}, terima kasih telah menjadi nasabah kami. Untuk unit {tipe} tahun {tahun}, tersedia kesempatan tambahan dana hingga {plafon}. Balas YA bila ingin kami bantu hitungkan. Syarat dan ketentuan berlaku. Perusahaan terdaftar dan diawasi OJK.";

const SENT = ["Terkirim", "Dibaca", "Dibalas", "Tertarik", "Deal", "Tidak tertarik"];
const COOLDOWN_DAYS = 30;

export default function RemarketingPage() {
  const f = useFilter();
  const toast = useToast();
  const { data } = useFetch<{ rows: Row[] }>(`/api/r/contacts${f.brand ? `?brand=${encodeURIComponent(f.brand)}` : ""}`);
  const { data: stops } = useFetch<{ rows: Row[] }>("/api/r/optouts");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const today = todayISO();

  const stopSet = useMemo(() => new Set((stops?.rows ?? []).map((o) => normPhone(o.phone))), [stops]);
  const pool = useMemo(() => {
    const rows = (data?.rows ?? []).filter((r) => String(r.blast ?? "yes").toLowerCase() !== "no" && r.status !== "Nomor tidak aktif" && r.phone_official);
    const stopped = rows.filter((r) => stopSet.has(normPhone(r.phone)));
    const ok = rows.filter((r) => !stopSet.has(normPhone(r.phone)));
    const recent = (r: Row) => SENT.includes(String(r.status)) && String(r.blast_date ?? "") >= addDays(today, -COOLDOWN_DAYS);
    const cooling = ok.filter(recent);
    const ready = ok.filter((r) => !recent(r));
    const value = (r: Row) => n(r.official_rec) || n(r.recommended) || n(r.loan);
    const topCut = [...ready].map(value).sort((a, b) => b - a)[Math.max(0, Math.floor(ready.length * 0.2) - 1)] ?? 0;
    return {
      stopped,
      cooling,
      segments: [
        { key: "warm", title: "Pernah berminat, belum ditindaklanjuti", hint: "Status Tertarik atau Dibalas. Paling mudah dikonversi.", rows: ready.filter((r) => r.status === "Tertarik" || r.status === "Dibalas") },
        { key: "big", title: "Potensi plafon terbesar", hint: "20% kontak dengan rekomendasi plafon tertinggi.", rows: ready.filter((r) => value(r) >= topCut && topCut > 0) },
        { key: "fresh", title: "Belum pernah dikirim", hint: "Status Belum dikirim. Audiens baru.", rows: ready.filter((r) => !r.status || r.status === "Belum dikirim") },
        { key: "silent", title: "Sudah dikirim, tidak merespons", hint: "Terkirim atau Dibaca lebih dari 30 hari lalu. Coba dengan penawaran berbeda.", rows: ready.filter((r) => (r.status === "Terkirim" || r.status === "Dibaca") && String(r.blast_date ?? "") < addDays(today, -COOLDOWN_DAYS)) },
      ].map((s) => ({ ...s, potential: s.rows.reduce((t, r) => t + value(r), 0) })),
    };
  }, [data, stopSet, today]);

  const fill = (r: Row) =>
    template
      .replaceAll("{nama}", String(r.name ?? "").trim())
      .replaceAll("{tipe}", String(r.unit_type ?? "").trim())
      .replaceAll("{tahun}", String(r.year ?? "").trim())
      .replaceAll("{plafon}", fmtMoney(n(r.official_rec) || n(r.recommended) || n(r.loan)))
      .replaceAll("{kontrak}", String(r.contract_no ?? ""));

  const download = (title: string, rows: Row[]) => {
    const esc = (v: unknown) => {
      let s = String(v ?? "");
      // a text cell starting with = or @ would run as a formula when the CSV is opened in a spreadsheet
      if (/^[=@]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const lines = [["nama", "nomor", "tipe_unit", "tahun", "rekomendasi_plafon", "nomor_kontrak", "pesan"].join(","), ...rows.map((r) => [r.name, r.phone_official, r.unit_type, r.year, r.official_rec ?? r.recommended, r.contract_no, fill(r)].map(esc).join(","))];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `remarketing-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${today}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`${rows.length} kontak diekspor`);
  };

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Blast" title="Remarketing Nasabah" desc="Kelompok nasabah dari Kontak Blast yang paling layak dihubungi lagi. Nomor di Daftar Jangan Dihubungi dan nomor yang baru dikirim dalam 30 hari otomatis dikecualikan, supaya nasabah tidak merasa diteror." />

      <Card title="Pesan" subtitle="Variabel: {nama} {tipe} {tahun} {plafon} {kontrak}">
        <textarea className="input" rows={4} value={template} onChange={(e) => setTemplate(e.target.value)} aria-label="Template pesan" />
        <ComplianceHint text={template} />
      </Card>

      {!data ? (
        <div className="skel h-40 w-full" />
      ) : pool.segments.every((s) => !s.rows.length) ? (
        <Empty text="Belum ada kontak yang layak. Upload data di WA Blast → Kontak blast." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {pool.segments.map((s) => (
            <section key={s.key} className="card flex min-w-0 flex-col p-5">
              <h3 className="serif text-[18px] leading-snug">{s.title}</h3>
              <p className="mt-1 text-[12.5px] text-[var(--muted)]">{s.hint}</p>
              <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2">
                <div>
                  <div className="serif text-[30px] leading-none tnum">{fmtNum(s.rows.length)}</div>
                  <div className="mt-1 text-[12px] text-[var(--muted)]">kontak</div>
                </div>
                <div className="min-w-0">
                  <div className="serif text-[22px] leading-none tnum">{fmtMoney(s.potential)}</div>
                  <div className="mt-1 text-[12px] text-[var(--muted)]">total rekomendasi plafon</div>
                </div>
              </div>
              <div className="mt-auto pt-4">
                <button className="btn btn-sm btn-primary" disabled={!s.rows.length} onClick={() => download(s.title, s.rows)}>
                  <Download size={14} /> Unduh CSV siap blast
                </button>
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="card p-4 text-[13px] leading-relaxed text-[var(--ink-2)]">
        Dikecualikan otomatis: <b>{fmtNum(pool.stopped.length)}</b> nomor di Daftar Jangan Dihubungi · <b>{fmtNum(pool.cooling.length)}</b> nomor yang sudah dikirim dalam {COOLDOWN_DAYS} hari terakhir · nomor tidak aktif.
      </div>
    </div>
  );
}
