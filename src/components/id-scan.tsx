"use client";

import { useRef, useState } from "react";
import { Camera, Check, Loader2 } from "lucide-react";

interface IdNumber {
  value: string;
  valid: boolean;
  info?: string;
}
type Quota = { month: { used: number; limit: number }; day: { used: number; limit: number } };
type Patch = Record<string, string>;
type Kind = "ktp" | "kk" | "stnk";

/**
 * Kecilkan foto (JPEG) sampai di bawah ~900 KB supaya lolos batas 1 MB OCR. Dokumen berhuruf kecil (STNK, KK) dipertahankan
 * lebih besar; STNK juga dijadikan hitam-putih dengan kontras sedikit dinaikkan supaya huruf kecil dan latar bermotif lebih terbaca.
 */
async function shrink(file: File, maxSide = 1600, enhance = false, rotate: 0 | 90 | 270 = 0): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => no(new Error("Foto tidak bisa dibuka"));
      i.src = url;
    });
    let side = Math.min(maxSide, Math.max(img.width, img.height));
    for (let q = 0.85; ; q -= 0.1) {
      const scale = Math.min(1, side / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      c.width = rotate ? h : w; // foto yang tergeletak miring (90° atau 270°) diputar tegak sebelum dibaca
      c.height = rotate ? w : h;
      const ctx = c.getContext("2d")!;
      if (enhance && "filter" in ctx) ctx.filter = "grayscale(1) contrast(1.25)"; // browser lama tanpa filter kanvas: foto dikirim apa adanya
      if (rotate === 90) {
        ctx.translate(c.width, 0);
        ctx.rotate(Math.PI / 2);
      } else if (rotate === 270) {
        ctx.translate(0, c.height);
        ctx.rotate(-Math.PI / 2);
      }
      ctx.drawImage(img, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", Math.max(q, 0.4)));
      if (!blob) throw new Error("Foto tidak bisa dikecilkan");
      if (blob.size <= 900_000 || (q <= 0.45 && side <= 900)) return blob;
      if (q <= 0.45) side = Math.round(side * 0.8);
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Foto berdiri (lebih tinggi daripada lebar): dokumen ini biasanya difoto mendatar, jadi kemungkinan besar tergeletak miring. */
async function isPortrait(file: File) {
  const bmp = await createImageBitmap(file).catch(() => null);
  const r = bmp ? bmp.height > bmp.width * 1.15 : false;
  bmp?.close();
  return r;
}

async function read(kind: Kind, file: File, rotate: 0 | 90 | 270 = 0) {
  const fd = new FormData();
  fd.set("file", await shrink(file, kind === "stnk" ? 2200 : kind === "kk" ? 2000 : 1600, kind === "stnk", rotate), "foto.jpg");
  fd.set("kind", kind);
  const res = await fetch("/api/ocr/id", { method: "POST", body: fd });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? "Foto tidak bisa dibaca");
  return j;
}

/** Satu slot unggah: pilih/foto dokumen, dibaca otomatis, hasilnya dikirim ke `onRead` (mengembalikan teks ringkasan). */
function Slot({ title, hint, kind, onRead, score, enough, onQuota, onPick }: { title: string; hint?: string; kind: Kind; onRead: (j: Record<string, unknown>) => { ok: boolean; text: string; chips?: IdNumber[] }; score: (j: Record<string, unknown>) => number; enough: number; onQuota: (q: Quota) => void; onPick: (v: string, who: "pemohon" | "penjamin") => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [chips, setChips] = useState<IdNumber[]>([]);
  const run = async (file: File) => {
    setBusy(true);
    setMsg(null);
    setChips([]);
    try {
      let j = await read(kind, file);
      if (j.quota) onQuota(j.quota as Quota);
      let best = score(j);
      // belum terbaca dan fotonya berdiri: kemungkinan tergeletak miring, coba putar 90° lalu 270° dan ambil hasil terbaik.
      // Tiap percobaan dihitung ke kuota gratis, makanya hanya dicoba bila hasil pertama kurang.
      if (best < enough && (kind !== "kk" ? await isPortrait(file) : best === 0)) {
        for (const rot of [90, 270] as const) {
          setMsg({ ok: true, text: "Foto tampak miring, mencoba memutarnya…" });
          const alt = await read(kind, file, rot).catch((e) => {
            if (/kuota/i.test((e as Error).message)) throw e;
            return null;
          });
          if (!alt) continue;
          if (alt.quota) onQuota(alt.quota as Quota);
          const s = score(alt);
          if (s > best) {
            j = alt;
            best = s;
          }
          if (best >= enough) break;
        }
      }
      const r = onRead(j);
      setMsg({ ok: r.ok, text: r.text });
      setChips(r.chips ?? []);
      setDone(r.ok);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
      setDone(false);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  const [over, setOver] = useState(false);
  // foto boleh diseret ke kotak ini, ditempel (Ctrl+V), atau dipilih lewat tombol
  const accept = (files?: FileList | null) => {
    const f = [...(files ?? [])].find((x) => /^image\/(jpeg|png|webp)$/.test(x.type));
    if (f) run(f);
    else if (files?.length) setMsg({ ok: false, text: "Format harus foto JPG, PNG, atau WebP." });
  };
  return (
    <div
      className={`rounded-lg border bg-[var(--surface)] p-3 outline-none transition-colors ${over ? "border-dashed border-[var(--ink)] bg-[var(--surface-2)]" : "border-[var(--line)]"}`}
      tabIndex={0}
      onDragEnter={(e) => (e.preventDefault(), setOver(true))}
      onDragOver={(e) => {
        e.preventDefault(); // tanpa ini browser menolak drop dan malah membuka fotonya
        e.dataTransfer.dropEffect = "copy";
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!busy) accept(e.dataTransfer.files);
      }}
      onPaste={(e) => !busy && accept(e.clipboardData.files)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">{title}</div>
          {hint && <div className="text-[11.5px] text-[var(--muted)]">{hint}</div>}
          <div className="text-[11px] text-[var(--muted)]">{over ? "Lepas foto di sini" : "Seret foto ke sini, tempel (Ctrl+V), atau pilih"}</div>
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => accept(e.target.files)} />
        <button type="button" className="btn btn-sm shrink-0" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : done ? <Check size={14} /> : <Camera size={14} />} {busy ? "Membaca…" : done ? "Ganti foto" : "Pilih foto"}
        </button>
      </div>
      {msg && <p className={`mt-1.5 text-[12px] ${msg.ok ? "text-[var(--ink-2)]" : "text-[var(--warning-ink)]"}`}>{msg.text}</p>}
      {chips.length > 0 && <ChipRow chips={chips} onPick={onPick} />}
    </div>
  );
}

/** NIK anggota KK: klik untuk dipakai sebagai NIK pemohon atau NIK penjamin. */
function ChipRow({ chips, onPick }: { chips: IdNumber[]; onPick: (v: string, who: "pemohon" | "penjamin") => void }) {
  return (
    <div className="mt-2 space-y-1">
      <div className="text-[12px] text-[var(--muted)]">NIK di KK, klik untuk mengisi:</div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((m) => (
          <span key={m.value} className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-2 py-0.5 text-[12px]" title={m.info ?? (m.valid ? "bentuk wajar" : "bentuk janggal")}>
            {m.value}
            {!m.valid && " ⚠"}
            <button type="button" className="font-semibold text-[var(--accent-ink)] hover:underline" onClick={() => onPick(m.value, "pemohon")}>
              pemohon
            </button>
            <button type="button" className="font-semibold text-[var(--accent-ink)] hover:underline" onClick={() => onPick(m.value, "penjamin")}>
              penjamin
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Panel unggah dokumen di form WA Leads: KTP pemohon, KTP penjamin (tidak wajib), KK, dan STNK. Tiap foto dikecilkan di browser,
 * dibaca di server (OCR), lalu angkanya diisikan ke form untuk dikonfirmasi. Foto tidak disimpan.
 */
export function DocPanel({ values, onPatch }: { values: Record<string, string>; onPatch: (p: Patch) => void }) {
  const [quota, setQuota] = useState<string | null>(null);
  const [seen, setSeen] = useState<{ nik?: string; members?: string[]; ktpNama?: string; stnkNama?: string }>({});
  const pick = (v: string, who: "pemohon" | "penjamin") => onPatch(who === "pemohon" ? { nik: v } : { nik_penjamin: v });
  const q = (x: Quota) => setQuota(`Kuota gratis OCR: ${x.month.used.toLocaleString("id-ID")} dari ${x.month.limit.toLocaleString("id-ID")} terpakai bulan ini (hari ini ${x.day.used} dari ${x.day.limit}).`);

  const readNik = (who: "pemohon" | "penjamin") => (j: Record<string, unknown>) => {
    const nik = j.nik as IdNumber | null;
    const nama = (j.nama as string | null) ?? undefined;
    if (!nik) return { ok: false, text: "NIK tidak terbaca. Coba foto yang lebih jelas dan lurus, atau ketik manual.", chips: (j.others as IdNumber[]) ?? [] };
    if (who === "pemohon") {
      onPatch({ nik: nik.value, ...(nama && !values.name ? { name: nama } : {}) });
      setSeen((s) => ({ ...s, nik: nik.value, ktpNama: nama }));
    } else onPatch({ nik_penjamin: nik.value });
    return { ok: nik.valid, text: `${nik.valid ? "NIK terbaca" : "NIK terbaca tapi bentuknya janggal"}${nik.info ? ` (${nik.info})` : ""}${nama ? ` · nama ${nama}` : ""}. Periksa dengan KTP sebelum disimpan.` };
  };
  const readKk = (j: Record<string, unknown>) => {
    const kk = j.kk as IdNumber | null;
    const members = (j.members as IdNumber[]) ?? [];
    if (kk) onPatch({ kk: kk.value });
    setSeen((s) => ({ ...s, members: members.map((m) => m.value) }));
    return {
      ok: !!kk?.valid,
      text: kk ? `${kk.valid ? "No. KK terbaca" : "No. KK terbaca tapi bentuknya janggal"} · ${members.length} NIK anggota terbaca. Periksa dengan KK sebelum disimpan.` : "No. KK tidak terbaca. Coba foto yang lebih jelas dan lurus, atau ketik manual.",
      chips: members,
    };
  };
  const readStnk = (j: Record<string, unknown>) => {
    const s = j as { plat: string | null; nama: string | null; merk: string | null; tahun: string | null; rangka: string | null; mesin: string | null };
    const patch: Patch = {};
    if (s.plat) patch.plat = s.plat;
    if (s.nama) patch.stnk_nama = s.nama;
    if (s.merk) patch.stnk_merk = s.merk;
    if (s.tahun) patch.stnk_tahun = s.tahun;
    if (s.rangka) patch.no_rangka = s.rangka;
    if (s.mesin) patch.no_mesin = s.mesin;
    onPatch(patch);
    setSeen((x) => ({ ...x, stnkNama: s.nama ?? undefined }));
    const got = Object.keys(patch).length;
    return { ok: got >= 3, text: got ? `${got} dari 6 data STNK terbaca (no. polisi, nama pemilik, merk/tipe, tahun, no. rangka, no. mesin). Periksa dengan STNK sebelum disimpan.` : "Data STNK tidak terbaca. Coba foto yang lebih jelas dan lurus, atau ketik manual." };
  };

  // mutu bacaan, dipakai untuk memilih hasil terbaik bila foto perlu diputar
  const scoreNik = (j: Record<string, unknown>) => ((j.nik as IdNumber | null)?.valid ? 10 : j.nik ? 5 : 0);
  const scoreKk = (j: Record<string, unknown>) => ((j.kk as IdNumber | null)?.valid ? 10 : j.kk ? 5 : 0);
  const scoreStnk = (j: Record<string, unknown>) => ["plat", "nama", "merk", "tahun", "rangka", "mesin"].filter((k) => j[k]).length;

  // pemeriksaan silang antar dokumen yang sudah terbaca
  const checks: string[] = [];
  const nik = values.nik || seen.nik;
  if (nik && seen.members?.length) checks.push(seen.members.includes(nik) ? "✓ NIK pemohon ada di KK" : "⚠ NIK pemohon tidak ada di daftar NIK KK");
  if (seen.ktpNama && seen.stnkNama) checks.push(seen.ktpNama === seen.stnkNama ? "✓ Nama KTP sama dengan nama STNK" : "⚠ Nama KTP berbeda dengan nama STNK");

  return (
    <fieldset className="mb-4 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3">
      <legend className="px-1 text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">Baca dokumen dari foto</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Slot title="KTP pemohon" hint="mengisi NIK (dan nama bila masih kosong)" kind="ktp" onRead={readNik("pemohon")} score={scoreNik} enough={10} onQuota={q} onPick={pick} />
        <Slot title="KTP penjamin (tidak wajib)" hint="mengisi NIK Penjamin" kind="ktp" onRead={readNik("penjamin")} score={scoreNik} enough={10} onQuota={q} onPick={pick} />
        <Slot title="Kartu Keluarga" hint="mengisi No. KK dan menampilkan NIK anggota" kind="kk" onRead={readKk} score={scoreKk} enough={10} onQuota={q} onPick={pick} />
        <Slot title="STNK" hint="mengisi no. polisi, nama pemilik, merk/tipe, tahun, no. rangka, no. mesin" kind="stnk" onRead={readStnk} score={scoreStnk} enough={5} onQuota={q} onPick={pick} />
      </div>
      {checks.length > 0 && <p className="mt-2 text-[12px] text-[var(--ink-2)]">{checks.join(" · ")}</p>}
      <p className="mt-2 text-[11.5px] text-[var(--muted)]">
        Foto dikirim ke layanan OCR (ocr.space) hanya untuk dibaca dan tidak disimpan di aplikasi. Minta persetujuan nasabah dulu, dan selalu periksa hasil bacaan dengan dokumen aslinya. {quota}
      </p>
    </fieldset>
  );
}
