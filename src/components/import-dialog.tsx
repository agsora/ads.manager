"use client";

import { useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { Modal } from "./resource-form";
import { api, useMeta, useToast } from "./providers";
import { RESOURCES } from "@/lib/resources";

interface Summary {
  sheet: string;
  resource: string;
  label: string;
  rows: number;
  skipped: number;
  matched: string[];
  upsert?: boolean;
  sample?: Record<string, unknown>[];
}

export function ImportDialog({ resourceKey, onClose, onDone, defaultPlatform, title }: { resourceKey: string; onClose: () => void; onDone: () => void; defaultPlatform?: string; title?: string }) {
  const toast = useToast();
  const { brands, reloadMeta } = useMeta();
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState(resourceKey);
  const [brand, setBrand] = useState("");
  const [platform, setPlatform] = useState(defaultPlatform ?? (resourceKey === "ads" ? "Meta" : ""));
  const { options } = useMeta();
  const showPlatform = target === "ads" || target === "wallets" || target === "auto";
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ summary: Summary[]; ignored: string[] } | null>(null);

  const send = async (isPreview: boolean) => {
    if (!file) return toast("Pilih file terlebih dahulu", "err");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("resource", target);
      fd.append("brand", brand);
      if (showPlatform && platform) fd.append("platform", platform);
      if (isPreview) fd.append("preview", "1");
      if (replace) fd.append("replace", "1");
      const j = await api<{ summary: Summary[]; ignored: string[]; imported?: number; replaced?: number }>("/api/import", "POST", fd);
      if (isPreview) setPreview(j);
      else {
        toast(`${j.imported} baris diimpor${j.replaced ? ` · ${j.replaced} baris lama diperbarui` : ""}`);
        await reloadMeta();
        onDone();
        onClose();
      }
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={title ?? "Impor Data dari Excel / CSV"} onClose={onClose} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">File (.xlsx atau .csv)</label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-[var(--line)] p-5 hover:border-[var(--accent)]">
            <FileSpreadsheet className="text-[var(--accent)]" />
            <div className="text-sm">
              {file ? <b>{file.name}</b> : <span className="text-[var(--ink-2)]">Klik untuk memilih file…</span>}
              <div className="text-xs text-[var(--muted)]">Judul kolom dicocokkan otomatis (mis. &quot;Nama Campaign&quot;, &quot;Tanggal Chat Masuk&quot;).</div>
            </div>
            <input
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
              }}
            />
          </label>
        </div>
        <div>
          <label className="label">Impor ke modul</label>
          <select className="input" value={target} onChange={(e) => (setTarget(e.target.value), setPreview(null))}>
            <option value="auto">Otomatis — deteksi semua sheet (workbook Marketing Report)</option>
            {RESOURCES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Brand default (jika kolom brand kosong)</label>
          <select className="input" value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="">— tidak ada —</option>
            {brands.map((b) => (
              <option key={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        {showPlatform && (
          <div>
            <label className="label">Platform default (jika file tidak punya kolom platform)</label>
            <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="">— tidak ada —</option>
              {(options.platform ?? []).map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          Ganti semua data lama di modul tujuan (hapus dulu, lalu impor)
        </label>
      </div>

      {preview && (
        <div className="mt-5 space-y-3">
          <div className="text-sm font-bold">Pratinjau</div>
          {preview.summary.map((s) => (
            <div key={s.sheet} className="rounded-xl border border-[var(--line)] p-3 text-[13px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  Sheet <b>{s.sheet}</b> → <b>{s.label}</b>
                </div>
                <div className="tnum">
                  <b className="text-[var(--good-ink)]">{s.rows} baris</b> akan diimpor{s.skipped ? ` · ${s.skipped} baris dilewati (tanpa data kunci)` : ""}
                </div>
              </div>
              <div className="mt-1.5 text-[12px] text-[var(--ink-2)]">Kolom terdeteksi: {s.matched.join(", ")}</div>
              {s.upsert && <div className="mt-1 text-[12px] text-[var(--good-ink)]">Upload ulang aman: baris yang sudah ada (kunci sama) akan diperbarui, bukan diduplikasi.</div>}
            </div>
          ))}
          {preview.ignored.length > 0 && <div className="text-[12px] text-[var(--muted)]">Sheet dilewati (tidak dikenali / kosong): {preview.ignored.join(", ")}</div>}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2 border-t border-[var(--line)] pt-4">
        <button className="btn" onClick={onClose}>
          Batal
        </button>
        <button className="btn" onClick={() => send(true)} disabled={busy || !file}>
          Pratinjau
        </button>
        <button className="btn btn-accent" onClick={() => send(false)} disabled={busy || !file}>
          <Upload size={15} /> {busy ? "Memproses…" : "Impor Sekarang"}
        </button>
      </div>
    </Modal>
  );
}
