"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";

interface IdNumber {
  value: string;
  valid: boolean;
  info?: string;
}

/** Kecilkan foto (sisi terpanjang 1600 px, JPEG) sampai di bawah ~900 KB supaya lolos batas 1 MB OCR. */
async function shrink(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => no(new Error("Foto tidak bisa dibuka"));
      i.src = url;
    });
    let side = Math.min(1600, Math.max(img.width, img.height));
    for (let q = 0.85; ; q -= 0.1) {
      const scale = Math.min(1, side / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", Math.max(q, 0.4)));
      if (blob && (blob.size <= 900_000 || (q <= 0.45 && side <= 900))) return blob;
      if (q <= 0.45) side = Math.round(side * 0.8);
      if (!blob) throw new Error("Foto tidak bisa dikecilkan");
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Tombol "Foto KTP" / "Foto KK" di bawah kolom NIK / No. KK: foto dikecilkan di browser, dikirim ke server untuk dibaca (OCR),
 * lalu angkanya diisikan ke form untuk dikonfirmasi. Foto tidak disimpan.
 */
export function IdScan({ kind, onNik, onKk, members }: { kind: "ktp" | "kk"; onNik: (v: string) => void; onKk?: (v: string) => void; members?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [list, setList] = useState<IdNumber[]>([]);
  const [quota, setQuota] = useState<string | null>(null);

  const run = async (file: File) => {
    setBusy(true);
    setMsg(null);
    setList([]);
    try {
      const blob = await shrink(file);
      const fd = new FormData();
      fd.set("file", blob, "foto.jpg");
      fd.set("kind", kind);
      const res = await fetch("/api/ocr/id", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Foto tidak bisa dibaca");
      const qt = j.quota as { month: { used: number; limit: number }; day: { used: number; limit: number } } | undefined;
      if (qt) setQuota(`Kuota gratis OCR: ${qt.month.used.toLocaleString("id-ID")} dari ${qt.month.limit.toLocaleString("id-ID")} terpakai bulan ini (hari ini ${qt.day.used} dari ${qt.day.limit}).`);
      if (kind === "ktp") {
        const nik = j.nik as IdNumber | null;
        if (!nik) {
          setMsg({ ok: false, text: "NIK tidak terbaca. Coba foto yang lebih jelas dan lurus, atau ketik manual." });
          setList(j.others ?? []);
          return;
        }
        onNik(nik.value);
        setMsg({ ok: nik.valid, text: nik.valid ? `NIK terbaca (${nik.info ?? "bentuk wajar"}). Periksa dengan KTP sebelum disimpan.` : "NIK terbaca tapi bentuknya janggal (kode wilayah atau tanggal lahir). Periksa dengan KTP." });
      } else {
        const kk = j.kk as IdNumber | null;
        const m = (j.members ?? []) as IdNumber[];
        if (!kk) setMsg({ ok: false, text: "No. KK tidak terbaca. Coba foto yang lebih jelas dan lurus, atau ketik manual." });
        else {
          onKk?.(kk.value);
          setMsg({ ok: kk.valid, text: kk.valid ? "No. KK terbaca. Periksa dengan KK sebelum disimpan." : "No. KK terbaca tapi bentuknya janggal. Periksa dengan KK." });
        }
        setList(m);
      }
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="mt-1.5 space-y-1.5">
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && run(e.target.files[0])} />
      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />} {busy ? "Membaca foto…" : kind === "ktp" ? "Ambil NIK dari foto KTP" : "Ambil No. KK dari foto KK"}
      </button>
      {quota && <p className="text-[11.5px] text-[var(--muted)]">{quota}</p>}
      {msg && <p className={`text-[12px] ${msg.ok ? "text-[var(--ink-2)]" : "text-[var(--warning-ink)]"}`}>{msg.text}</p>}
      {list.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-[var(--muted)]">{members ? "NIK di KK, klik untuk dipakai sebagai NIK pemohon:" : "Angka lain yang terbaca:"}</span>
          {list.map((m) => (
            <button key={m.value} type="button" className="pill !h-7 !text-[12px]" title={m.info ?? (m.valid ? "bentuk wajar" : "bentuk janggal")} onClick={() => onNik(m.value)}>
              {m.value}
              {!m.valid && " ⚠"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
