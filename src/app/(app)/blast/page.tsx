"use client";

import { useState } from "react";
import { ChevronDown, Download, Send, Upload, UserPlus } from "lucide-react";
import { MenuItem, Popover } from "@/components/popover";
import { StopButton } from "@/components/stop-button";
import { ComplianceHint } from "@/components/field-hints";
import { normPhone } from "@/lib/phone";
import { PageHeader } from "@/components/shell";
import { ResourceTable } from "@/components/resource-table";
import { ImportDialog } from "@/components/import-dialog";
import { Modal } from "@/components/resource-form";
import { api, useFilter, useMeta, useToast } from "@/components/providers";
import { useAnalytics } from "@/components/use-analytics";
import { BarList, Card, Funnel, Kpi, MiniTable, SplitBar } from "@/components/charts";
import { fmtMoney, todayISO } from "@/lib/format";
import type { Row } from "@/lib/resources";

const DEFAULT_TEMPLATE =
  "Halo Bapak/Ibu {nama}, pemilik {tipe} tahun {tahun}. Anda berkesempatan mendapatkan fasilitas dana hingga {plafon} dengan proses cepat & BPKB aman. Balas YA untuk info lebih lanjut.";

export default function BlastPage() {
  const [tab, setTab] = useState<"contacts" | "campaigns">("contacts");
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="WhatsApp" title="WA Blast" desc="Kelola daftar kontak blast (nomor kontrak, nama, nomor resmi 62…, harga pasar, plafon, pinjaman, rekomendasi, tipe unit, tahun), ekspor siap kirim dengan pesan personal, catat hasilnya, lalu jadikan leads." />
      <div className="tabs">
        <button className="tab" data-on={tab === "contacts"} onClick={() => setTab("contacts")}>Kontak blast</button>
        <button className="tab" data-on={tab === "campaigns"} onClick={() => setTab("campaigns")}>Laporan kampanye blast</button>
      </div>
      {tab === "contacts" ? <Contacts /> : <Campaigns />}
    </div>
  );
}

function Contacts() {
  const { data: a, reload } = useAnalytics();
  const { options } = useMeta();
  const toast = useToast();
  const [upload, setUpload] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [tick, setTick] = useState(0);
  const refresh = () => {
    reload();
    setTick((t) => t + 1);
  };
  const k = a?.contactKpis;

  const convert = async (ids: number[], done: () => void) => {
    try {
      const j = await api<{ created: number; skipped: number }>("/api/contacts/convert", "POST", { ids });
      toast(`${j.created} kontak masuk WA Leads${j.skipped ? ` · ${j.skipped} sudah ada` : ""}`);
      done();
      reload();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const setStatus = async (ids: number[], status: string, done: () => void) => {
    if (!status) return;
    await api("/api/r/contacts/bulk", "POST", { ids, data: { status } });
    toast(`${ids.length} kontak → ${status}`);
    done();
    reload();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-accent" onClick={() => setUpload(true)}>
          <Upload size={15} /> Upload data kontak
        </button>
        <button className="btn" onClick={() => setExporting(true)}>
          <Send size={15} /> Ekspor untuk blast
        </button>
        <Popover
          label="Menu lainnya"
          width={220}
          button={(open) => (
            <button className={`btn ${open ? "!border-[var(--ink)]" : ""}`}>
              Lainnya <ChevronDown size={14} className="text-[var(--muted)]" />
            </button>
          )}
        >
          {(close) => (
            <div className="p-1.5">
              <MenuItem icon={<Download size={14} />} href="/api/template?resource=contacts" onClick={close}>
                Unduh template kontak
              </MenuItem>
            </div>
          )}
        </Popover>
      </div>

      {k && (
        <div className="stat-grid">
          <Kpi label="Kontak di periode" value={k.contacts} format="number" />
          <Kpi label="Siap blast (yes)" value={k.ready} format="number" hint={`${k.pending} belum dikirim`} />
          <Kpi label="Terkirim" value={k.sent} format="number" />
          <Kpi label="Respon rate" value={k.responseRate} format="percent" hint="membalas ÷ terkirim" />
          <Kpi label="Tertarik + deal" value={k.interested} format="number" hint={k.interestRate !== null ? `${(k.interestRate * 100).toFixed(1)}% dari terkirim` : ""} />
          <Kpi label="Potensi plafon" value={k.potential} format="money" hint="total rek. resmi siap blast" />
        </div>
      )}

      {a && a.notConverted.length > 0 && (
        <div className="card flex flex-wrap items-center gap-3 border-[#e2b7a5] p-4">
          <UserPlus size={18} className="text-[var(--accent-ink)]" />
          <div className="flex-1 text-[13.5px]">
            <b>{a.notConverted.length} kontak</b> sudah membalas / tertarik tetapi belum ada di WA Leads.
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => convert(a.notConverted.map((x) => Number(x.id)), refresh)}>
            Jadikan leads sekarang
          </button>
        </div>
      )}

      {a && a.contactKpis.contacts > 0 && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="Rekap per batch" className="lg:col-span-2">
            <MiniTable
              cols={[
                { key: "name", label: "Batch" }, { key: "contacts", label: "Kontak", format: "number" }, { key: "sent", label: "Terkirim", format: "number" },
                { key: "responded", label: "Membalas", format: "number" }, { key: "interested", label: "Tertarik", format: "number" }, { key: "deals", label: "Deal", format: "number" },
                { key: "interestRate", label: "% Tertarik", format: "percent" }, { key: "potential", label: "Potensi", format: "money" },
              ]}
              rows={a.contactsByBatch.map((b) => ({ ...b, name: b.name === "(Kosong)" ? "Tanpa batch" : b.name }))}
            />
          </Card>
          <Card title="Status kontak">
            <SplitBar parts={a.contactStatus} />
          </Card>
          <Card title="Minat per tipe unit" subtitle="% tertarik dari yang terkirim" className="lg:col-span-2">
            <BarList items={a.contactsByUnit.filter((u) => u.sent > 0).slice(0, 10).map((u) => ({ name: u.name, value: u.interestRate ?? 0, sub: `${u.interested}/${u.sent}` }))} format="percent" sub />
          </Card>
          <Card title="Kontak per tahun unit">
            <BarList items={a.contactsByYear.slice(0, 8).map((y) => ({ name: y.name, value: y.contacts }))} color="var(--s2)" />
          </Card>
        </div>
      )}

      <ResourceTable
        resourceKey="contacts"
        quickFilters={["status", "blast"]}
        computedCols={[]}
        reloadKey={tick}
        onChanged={reload}
        selectionActions={(ids, done) => (
          <>
            <select className="input !h-[30px] !w-auto !text-[12.5px]" value="" onChange={(e) => setStatus(ids, e.target.value, done)} aria-label="Ubah status terpilih">
              <option value="">Ubah status…</option>
              {(options.contact_status ?? []).map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
            <button className="btn btn-sm btn-primary" onClick={() => convert(ids, done)}>
              <UserPlus size={13} /> Jadikan leads
            </button>
            <StopButton resource="contacts" ids={ids} done={() => (done(), refresh())} />
          </>
        )}
      />

      {upload && <ImportDialog resourceKey="contacts" title="Upload Data Kontak Blast" onClose={() => setUpload(false)} onDone={refresh} />}
      {exporting && <ExportForBlast onClose={() => setExporting(false)} onDone={refresh} />}
    </div>
  );
}

function ExportForBlast({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const f = useFilter();
  const toast = useToast();
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [onlyPending, setOnlyPending] = useState(true);
  const [mark, setMark] = useState(true);
  const [batch, setBatch] = useState(`Blast ${todayISO()}`);
  const [busy, setBusy] = useState(false);

  const fill = (r: Row) =>
    template
      .replaceAll("{nama}", String(r.name ?? "").trim())
      .replaceAll("{tipe}", String(r.unit_type ?? "").trim())
      .replaceAll("{tahun}", String(r.year ?? "").trim())
      .replaceAll("{plafon}", fmtMoney(Number(r.official_rec ?? r.recommended ?? r.loan ?? 0)))
      .replaceAll("{kontrak}", String(r.contract_no ?? ""));

  const run = async () => {
    setBusy(true);
    try {
      const qs = new URLSearchParams({ from: f.from, to: f.to, ...(f.brand ? { brand: f.brand } : {}) });
      const { rows } = await api<{ rows: Row[] }>(`/api/r/contacts?${qs}`, "GET");
      const { rows: stops } = await api<{ rows: Row[] }>("/api/r/optouts", "GET");
      const stopSet = new Set(stops.map((o) => normPhone(o.phone)));
      const eligible = rows.filter((r) => String(r.blast ?? "yes").toLowerCase() !== "no" && (!onlyPending || !r.status || r.status === "Belum dikirim"));
      const list = eligible.filter((r) => !stopSet.has(normPhone(r.phone)));
      const skippedStop = eligible.length - list.length;
      if (!list.length) throw new Error("Tidak ada kontak yang cocok di periode/filter ini");
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = [
        ["nama", "nomor", "tipe_unit", "tahun", "rekomendasi_plafon", "nomor_kontrak", "pesan"].join(","),
        ...list.map((r) => [r.name, r.phone_official, r.unit_type, r.year, r.official_rec ?? r.recommended, r.contract_no, fill(r)].map(esc).join(",")),
      ];
      const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `blast-${todayISO()}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      if (mark) await api("/api/r/contacts/bulk", "POST", { ids: list.map((r) => r.id), data: { status: "Terkirim", batch, blast_date: todayISO() } });
      toast(`${list.length} kontak diekspor${mark ? " & ditandai Terkirim" : ""}${skippedStop ? ` · ${skippedStop} nomor di Daftar Jangan Dihubungi dilewati` : ""}`);
      onDone();
      onClose();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  const sample = { name: "MAHMIZAR", unit_type: "Scoopy Prestige", year: "2025", official_rec: 17000000, contract_no: "24101250400328" } as Row;
  return (
    <Modal title="Ekspor kontak untuk blast" onClose={onClose} wide>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className="label">Template pesan</label>
          <textarea className="input" rows={7} value={template} onChange={(e) => setTemplate(e.target.value)} />
          <p className="mt-1.5 text-[12px] text-[var(--muted)]">Variabel: {"{nama} {tipe} {tahun} {plafon} {kontrak}"}</p>
          <ComplianceHint text={template} />
        </div>
        <div>
          <div className="label">Pratinjau</div>
          <div className="rounded-xl border border-[var(--line)] bg-[#efe9dc] p-4">
            <div className="max-w-[92%] rounded-lg rounded-tl-none bg-white px-3 py-2 text-[13.5px] leading-relaxed shadow-[0_1px_1px_rgba(0,0,0,.06)]">{fill(sample)}</div>
          </div>
          <div className="mt-4 space-y-2 text-[13.5px]">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} /> Hanya yang belum dikirim
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={mark} onChange={(e) => setMark(e.target.checked)} /> Tandai sebagai Terkirim dengan batch
            </label>
            {mark && <input className="input" value={batch} onChange={(e) => setBatch(e.target.value)} aria-label="Nama batch" />}
          </div>
        </div>
      </div>
      <p className="mt-4 text-[12.5px] text-[var(--muted)]">
        File CSV berisi kolom nama, nomor (format 62…), tipe unit, tahun, rekomendasi plafon, nomor kontrak dan pesan yang sudah dipersonalisasi — siap diupload ke tools blast (Scooter, WATI, Qontak, dll). Mengikuti filter brand & periode di atas.
      </p>
      <div className="mt-5 flex justify-end gap-2 border-t border-[var(--line)] pt-4">
        <button className="btn" onClick={onClose}>Batal</button>
        <button className="btn btn-accent" onClick={run} disabled={busy}>
          <Download size={15} /> {busy ? "Menyiapkan…" : "Unduh CSV"}
        </button>
      </div>
    </Modal>
  );
}

function Campaigns() {
  const { data: a, reload } = useAnalytics();
  const k = a?.kpis.blast;
  const p = a?.prevKpis.blast;
  return (
    <div className="space-y-6">
      {k && (
        <div className="stat-grid">
          <Kpi label="Terkirim" value={k.sent} prev={p?.sent} format="number" />
          <Kpi label="Delivery rate" value={k.deliveryRate} prev={p?.deliveryRate} format="percent" />
          <Kpi label="Read rate" value={k.readRate} prev={p?.readRate} format="percent" />
          <Kpi label="Reply rate" value={k.replyRate} prev={p?.replyRate} format="percent" />
          <Kpi label="Leads" value={k.leads} prev={p?.leads} format="number" />
          <Kpi label="Biaya" value={k.cost} prev={p?.cost} format="money" invert />
        </div>
      )}
      {a && a.blastList.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Funnel WA blast">
            <Funnel steps={a.blastFunnel} />
          </Card>
          <Card title="Perbandingan kampanye" subtitle="Urut dari reply rate tertinggi">
            <MiniTable
              cols={[{ key: "name", label: "Blast" }, { key: "sent", label: "Kirim", format: "number" }, { key: "replyRate", label: "Reply", format: "percent" }, { key: "leads", label: "Leads", format: "number" }, { key: "deals", label: "Deal", format: "number" }, { key: "cpl", label: "Biaya/Lead", format: "money" }]}
              rows={[...a.blastList].sort((x, y) => (y.replyRate ?? 0) - (x.replyRate ?? 0))}
            />
          </Card>
        </div>
      )}
      <ResourceTable resourceKey="blast" quickFilters={["tool", "status"]} computedCols={["delivery_rate", "read_rate", "reply_rate", "cpl"]} onChanged={reload} />
    </div>
  );
}
