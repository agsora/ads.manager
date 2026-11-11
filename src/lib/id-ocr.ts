/**
 * Membaca NIK dari foto KTP dan No. KK (serta NIK anggota) dari foto KK lewat OCR.space.
 * Foto tidak disimpan dan teks mentah tidak dikembalikan atau dicatat: hanya angka 16 digit yang lolos pemeriksaan bentuk.
 * Hasil OCR bisa keliru (mis. O ↔ 0, I ↔ 1, B ↔ 8), jadi selalu ditampilkan untuk dikonfirmasi petugas.
 */

const API = "https://api.ocr.space/parse/image";

/** Kode provinsi yang dipakai pada 2 digit pertama NIK / No. KK. */
const PROVINCES = new Set([11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 31, 32, 33, 34, 35, 36, 51, 52, 53, 61, 62, 63, 64, 65, 71, 72, 73, 74, 75, 76, 81, 82, 91, 92, 93, 94, 95, 96, 97]);

export interface IdNumber {
  value: string;
  /** bentuk angka masuk akal (kode provinsi dan tanggal); bukan bukti identitas asli */
  valid: boolean;
  /** NIK: "perempuan · lahir 23-04-1990 (tahun 2 digit)" dsb., untuk membantu petugas mencocokkan */
  info?: string;
}

const CONFUSED: Record<string, string> = { O: "0", o: "0", Q: "0", D: "0", I: "1", l: "1", i: "1", "|": "1", Z: "2", z: "2", S: "5", s: "5", G: "6", B: "8" };
const fixDigits = (s: string) => s.replace(/[OoQDIli|ZzSsGB]/g, (c) => CONFUSED[c] ?? c);

function datePart(v: string, offset: number, womanPlus40: boolean) {
  const dd = Number(v.slice(offset, offset + 2));
  const mm = Number(v.slice(offset + 2, offset + 4));
  const woman = womanPlus40 && dd > 40;
  const day = woman ? dd - 40 : dd;
  return { day, mm, woman, ok: day >= 1 && day <= 31 && mm >= 1 && mm <= 12 };
}

/** NIK: provinsi (2) · kab/kota (2) · kecamatan (2) · tanggal lahir DDMMYY (perempuan: DD + 40) · nomor urut (4). */
export function checkNik(v: string): IdNumber {
  if (!/^\d{16}$/.test(v)) return { value: v, valid: false };
  const d = datePart(v, 6, true);
  const valid = PROVINCES.has(Number(v.slice(0, 2))) && d.ok && v.slice(12) !== "0000";
  return { value: v, valid, info: d.ok ? `${d.woman ? "perempuan" : "laki-laki"} · lahir tgl ${String(d.day).padStart(2, "0")}-${v.slice(8, 10)}-${v.slice(10, 12)} (tahun 2 digit)` : undefined };
}

/** No. KK: kode wilayah (6) · tanggal DDMMYY (tanggal KK dibuat) · nomor urut (4). */
export function checkKk(v: string): IdNumber {
  if (!/^\d{16}$/.test(v)) return { value: v, valid: false };
  const d = datePart(v, 6, false);
  return { value: v, valid: PROVINCES.has(Number(v.slice(0, 2))) && d.ok && v.slice(12) !== "0000" };
}

/** Semua deretan 16 digit di teks (spasi, titik, atau strip di dalam angka diabaikan; huruf mirip angka diperbaiki). */
function sixteenDigit(line: string): string[] {
  const out: string[] = [];
  // 1) deretan rapat 16 karakter "mirip angka"
  for (const m of line.matchAll(/(?<![A-Za-z0-9])[0-9OoQDIli|ZzSsGB]{16}(?![A-Za-z0-9])/g)) out.push(fixDigits(m[0]));
  // 2) angka yang dipecah spasi/titik/strip oleh OCR, mis. "1471 0123 0490 0007"
  for (const m of line.matchAll(/(?<![A-Za-z0-9])(?:[0-9OoQDIli|ZzSsGB][ .\-]?){16}(?![A-Za-z0-9])/g)) {
    const joined = fixDigits(m[0].replace(/[ .\-]/g, ""));
    if (joined.length === 16) out.push(joined);
  }
  return [...new Set(out)].filter((x) => /^\d{16}$/.test(x));
}

export interface KtpResult {
  nik: IdNumber | null;
  /** nama di KTP (huruf besar), bila terbaca */
  nama: string | null;
  /** angka 16 digit lain yang terbaca di foto (jarang berguna, untuk pilihan manual) */
  others: IdNumber[];
}

export function parseKtp(text: string): KtpResult {
  const lines = text.split(/\r?\n/);
  let labelled: string | null = null;
  for (const l of lines) {
    if (!/NIK/i.test(l)) continue;
    const rest = l.slice(l.search(/NIK/i) + 3).replace(/^[\s:.;,\-]+/, "");
    const hit = sixteenDigit(rest)[0];
    if (hit) {
      labelled = hit;
      break;
    }
  }
  const all = [...new Set(lines.flatMap(sixteenDigit))];
  // di KTP, angka 16 digit yang tertulis setelah label NIK dipakai lebih dulu; bila tak ada, hanya bila persis satu kandidat valid
  const nama = labelValue(lines, /^\s*NAMA\b/i, (v) => NAME.test(v)).toUpperCase() || null;
  if (labelled) return { nik: checkNik(labelled), nama, others: all.filter((x) => x !== labelled).map(checkNik) };
  const valid = all.filter((x) => checkNik(x).valid);
  if (valid.length === 1) return { nik: checkNik(valid[0]), nama, others: all.filter((x) => x !== valid[0]).map(checkNik) };
  return { nik: null, nama, others: all.map(checkNik) };
}

/** Nilai di sebelah label ("Nama : BUDI") atau di baris berikutnya bila labelnya sendirian; kosong bila tidak ada yang lolos cek. */
function labelValue(lines: string[], label: RegExp, ok: (v: string) => boolean = () => true): string {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(label);
    if (!m) continue;
    const same = lines[i].slice((m.index ?? 0) + m[0].length).replace(/^[\s:.;,\-]+/, "").trim();
    if (same && ok(same)) return same;
    const next = (lines[i + 1] ?? "").replace(/^[\s:.;,\-]+/, "").trim();
    if (next && ok(next)) return next;
  }
  return "";
}

const NAME = /^[A-Za-z .'\-]{3,60}$/;

/** Label yang dikenali di STNK. Semuanya dipakai sebagai batas: nilai sebuah label berakhir di label berikutnya, termasuk yang ada di baris yang sama. */
const STNK_LABELS: [string, RegExp][] = [
  ["plat", /N[O0](?:MOR|\.)?\s*(?:REGISTRASI|REG\.?|POLISI)/gi],
  ["nama", /NAMA\s*PEMILIK/gi],
  ["alamat", /ALAMAT/gi],
  ["merk", /MERK|MEREK(?:\s*\/\s*TYPE)?/gi],
  ["tipe", /TYPE|TIPE/gi],
  ["jenis", /JENIS/gi],
  ["model", /MODEL/gi],
  ["tahun", /(?:TAHUN|TH\.?)\s*PEMB(?:UATAN|\.)?(?:\s*\/\s*PERAKITAN)?/gi],
  ["tahunreg", /TAHUN\s*REGISTRASI/gi],
  ["silinder", /ISI\s*SILINDER/gi],
  ["warna", /WARNA(?:\s*TNKB)?/gi],
  ["bbm", /BAHAN\s*BAKAR/gi],
  ["rangka", /N[O0](?:MOR|\.)?\s*RANGKA(?:\s*\/\s*NIK)?(?:\s*\/\s*VIN)?/gi],
  ["mesin", /N[O0](?:MOR|\.)?\s*MESIN/gi],
  ["bpkb", /N[O0](?:MOR|\.)?\s*BPKB/gi],
  ["lokasi", /KODE\s*LOKASI/gi],
  ["urut", /N[O0](?:MOR|\.)?\s*URUT\s*PENDAFTARAN/gi],
  ["berlaku", /BERLAKU\s*(?:S\/D|SAMPAI|HINGGA)/gi],
];

/** Pecah teks OCR menjadi pasangan label → nilai, apa pun tata letaknya (satu label per baris, dua label sejajar, atau nilai di baris bawah). */
export function stnkFields(text: string): Record<string, string> {
  const flat = text.replace(/\r/g, "").replace(/[\t\n]+/g, " ⏎ ");
  const hits: { key: string; start: number; end: number }[] = [];
  for (const [key, re] of STNK_LABELS) for (const m of flat.matchAll(re)) hits.push({ key, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  // label yang saling tumpang tindih: ambil yang terpanjang
  const kept: typeof hits = [];
  for (const h of hits) if (!kept.length || h.start >= kept[kept.length - 1].end) kept.push(h);
  const out: Record<string, string> = {};
  kept.forEach((h, i) => {
    const raw = flat.slice(h.end, kept[i + 1]?.start ?? flat.length);
    const v = raw.replace(/⏎/g, " ").replace(/^[\s:.;,\-]+/, "").replace(/\s+/g, " ").trim();
    if (v && !(h.key in out)) out[h.key] = v;
  });
  return out;
}

const toDigits = (s: string) => s.replace(/[OoQDIli|ZzSsB]/g, (c) => ({ O: "0", o: "0", Q: "0", D: "0", I: "1", l: "1", i: "1", "|": "1", Z: "2", z: "2", S: "5", s: "5", B: "8" })[c] ?? c);
const toLetters = (s: string) => s.replace(/[0158]/g, (c) => ({ "0": "O", "1": "I", "5": "S", "8": "B" })[c] ?? c);

/** Plat: 1–2 huruf wilayah · 1–4 angka · 0–3 huruf seri. Huruf yang tertukar dengan angka (dan sebaliknya) diperbaiki per bagian. */
export function normPlat(v: string): string | null {
  const t = v.toUpperCase().replace(/[^A-Z0-9 ]/g, "").trim();
  const parts = t.split(/\s+/);
  let area = "";
  let num = "";
  let seri = "";
  if (parts.length >= 2) {
    area = toLetters(parts[0]);
    num = toDigits(parts[1]);
    seri = toLetters(parts.slice(2).join(""));
  } else {
    const m = t.match(/^([A-Z0-9]{1,2}?)([A-Z0-9]{1,4}?)([A-Z]{0,3})$/);
    if (!m) return null;
    [area, num, seri] = [toLetters(m[1]), toDigits(m[2]), m[3]];
  }
  return /^[A-Z]{1,2}$/.test(area) && /^\d{1,4}$/.test(num) && /^[A-Z]{0,3}$/.test(seri) ? [area, num, seri].filter(Boolean).join(" ") : null;
}

export interface StnkResult {
  plat: string | null;
  nama: string | null;
  merk: string | null;
  tahun: string | null;
  rangka: string | null;
  mesin: string | null;
}

/** STNK: No. Registrasi (plat), Nama Pemilik, Merk, Type, Tahun Pembuatan, No. Rangka, No. Mesin. Semua hasil perlu dicek petugas. */
export function parseStnk(text: string): StnkResult {
  const f = stnkFields(text);
  const alnum = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");
  // nilai nomor rangka bisa memuat sisa label ("NIK/VIN") bila OCR memotongnya
  let rangka = alnum((f.rangka ?? "").replace(/^(?:\/?\s*NIK\s*\/?\s*VIN)/i, ""));
  if (rangka.length === 17) rangka = rangka.replace(/[OQ]/g, "0").replace(/I/g, "1"); // nomor rangka (VIN) tidak memakai huruf I, O, Q
  const mesin = alnum(f.mesin ?? "");
  const tahun = toDigits(f.tahun ?? "").match(/(19|20)\d{2}/)?.[0] ?? "";
  const nama = NAME.test(f.nama ?? "") ? (f.nama as string).toUpperCase() : "";
  // "HONDA/H1B02N42L1 A/T" (kolom Merek/Type di TBPKP) → merk dan type dipisah spasi
  const merk = [f.merk, f.tipe].filter(Boolean).join(" ").toUpperCase().replace(/\s*\/\s*/, " ");
  const base: StnkResult = {
    plat: f.plat ? normPlat(f.plat) : null,
    nama: nama || null,
    merk: merk || null,
    tahun: tahun || null,
    rangka: rangka.length >= 10 && rangka.length <= 20 ? rangka : null,
    mesin: mesin.length >= 6 && mesin.length <= 15 ? mesin : null,
  };
  // foto STNK asli biasanya "bertumpuk": semua label di kolom kiri dan semua nilai di kolom kanan, jadi nilai tidak ada di sebelah labelnya.
  // Data yang masih kosong dicari dari bentuk nilainya (plat, nomor rangka 17 karakter, merk dikenal, tahun yang berdiri sendiri).
  if (stnkScore(base) < 6) {
    const extra = stackedStnk(text, base);
    for (const k of Object.keys(extra) as (keyof StnkResult)[]) if (!base[k] && extra[k]) base[k] = extra[k] ?? null;
  }
  return base;
}

const BRANDS = ["HONDA", "YAMAHA", "SUZUKI", "KAWASAKI", "VESPA", "PIAGGIO", "TVS", "BAJAJ", "KTM", "TOYOTA", "DAIHATSU", "MITSUBISHI", "NISSAN", "ISUZU", "MAZDA", "HYUNDAI", "KIA", "WULING", "DFSK", "CHERY", "BMW", "MERCEDES", "FORD", "CHEVROLET", "DATSUN", "SUBARU"];
const NOT_NAME = /ALAMAT|SEPEDA|MOTOR|MOBIL|BENSIN|HITAM|PUTIH|MERAH|BIRU|SOLO|MODEL|JENIS|NOMOR|SURAT|KEPOLISIAN|PERUM|JALAN|KELURAHAN|KECAMATAN|KOTA|KABUPATEN|KEPALA|REGISTRASI|PEMILIK/;

/** Cari data STNK dari bentuk nilainya saja (tidak bergantung letak label). Hanya mengisi yang diminta; hasilnya tetap perlu dicek petugas. */
function stackedStnk(text: string, have: StnkResult): Partial<StnkResult> {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/[\t ]+/g, " ").trim().toUpperCase()).filter(Boolean);
  const out: Partial<StnkResult> = {};
  let platAt = -1;
  if (!have.plat) {
    lines.forEach((l, i) => {
      if (platAt >= 0) return;
      const m = l.match(/^([A-Z0-9]{1,2}) ?([0-9OIS]{1,4}) ?([A-Z]{1,3})$/);
      if (m && /[A-Z]/.test(m[1]) && /\d/.test(m[2])) {
        const p = normPlat(l);
        if (p) {
          out.plat = p;
          platAt = i;
        }
      }
    });
  }
  if (!have.nama) {
    const from = platAt >= 0 ? platAt + 1 : 0;
    const hit = lines.slice(from, from + 4).find((l) => /^[A-Z][A-Z .'\-]{2,59}$/.test(l) && !NOT_NAME.test(l) && !BRANDS.includes(l));
    if (hit && platAt >= 0) out.nama = hit;
  }
  let vinAt = -1;
  if (!have.rangka) {
    lines.forEach((l, i) => {
      if (vinAt >= 0) return;
      const c = l.replace(/[^A-Z0-9]/g, "");
      if (c.length === 17 && /[A-Z]/.test(c) && /\d/.test(c) && /^M/.test(c)) {
        out.rangka = c.replace(/[OQ]/g, "0").replace(/I/g, "1");
        vinAt = i;
      }
    });
  }
  if (!have.mesin) {
    const from = vinAt >= 0 ? vinAt + 1 : 0;
    const hit = lines.slice(from, from + 4).map((l) => l.replace(/[^A-Z0-9]/g, "")).find((c) => c.length >= 8 && c.length <= 14 && /[A-Z]/.test(c) && /\d/.test(c) && c !== out.rangka);
    if (hit && vinAt >= 0) out.mesin = hit;
  }
  if (!have.tahun) {
    const years = lines.map((l) => l.match(/^\W*((?:19|20)\d{2})\W*$/)?.[1]).filter(Boolean).map(Number).filter((y) => y >= 1990 && y <= new Date().getFullYear() + 1);
    if (years.length) out.tahun = String(Math.min(...years)); // tahun pembuatan lebih tua dari tahun registrasi
  }
  if (!have.merk) {
    const bi = lines.findIndex((l) => BRANDS.includes(l.split(/[ \/]/)[0]));
    if (bi >= 0) {
      const brand = lines[bi].split(/[ \/]/)[0];
      const same = lines[bi].slice(brand.length).replace(/^[\s\/]+/, "");
      const next = same || lines.slice(bi + 1, bi + 3).find((l) => /^[A-Z0-9][A-Z0-9 \/.\-]{3,24}$/.test(l) && /\d/.test(l) && l.replace(/[^A-Z0-9]/g, "") !== out.rangka);
      out.merk = [brand, next].filter(Boolean).join(" ");
    }
  }
  return out;
}

const stnkScore = (r: StnkResult) => Object.values(r).filter(Boolean).length;

export interface KkResult {
  kk: IdNumber | null;
  /** NIK yang tercantum di tabel anggota keluarga */
  members: IdNumber[];
}

export function parseKk(text: string): KkResult {
  const lines = text.split(/\r?\n/);
  let kk: string | null = null;
  // No. KK ada di kepala dokumen: baris yang memuat "No" atau "KARTU KELUARGA", sebelum tabel anggota
  for (let i = 0; i < lines.length && i < 12 && !kk; i++) {
    const l = lines[i];
    if (/\bNo\b\.?|KARTU\s+KELUARGA|NOMOR/i.test(l)) {
      const hit = sixteenDigit(l)[0] ?? sixteenDigit(lines[i + 1] ?? "")[0];
      if (hit) kk = hit;
    }
  }
  const all = [...new Set(lines.flatMap(sixteenDigit))];
  if (!kk) kk = all.find((x) => checkKk(x).valid && !checkNik(x).valid) ?? all[0] ?? null;
  return { kk: kk ? checkKk(kk) : null, members: all.filter((x) => x !== kk).map(checkNik) };
}

/** OCR.space menolak karena kuota/batas paket gratis, atau kuota lokal kita sendiri sudah penuh. */
export class OcrQuotaError extends Error {}

interface OcrResponse {
  ParsedResults?: { ParsedText?: string }[];
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[];
}

async function ocr(file: Blob, name: string, key: string, engine: 2 | 3, table: boolean): Promise<string> {
  const fd = new FormData();
  fd.set("file", file, name);
  fd.set("OCREngine", String(engine));
  fd.set("scale", "true");
  fd.set("detectOrientation", "true");
  if (table) fd.set("isTable", "true");
  const res = await fetch(API, { method: "POST", headers: { apikey: key }, body: fd, signal: AbortSignal.timeout(45_000) });
  if (res.status === 429) throw new OcrQuotaError("OCR.space membalas 429 (terlalu banyak permintaan)");
  if (!res.ok) throw new Error(`OCR.space membalas ${res.status}`);
  const j = (await res.json()) as OcrResponse;
  if (j.IsErroredOnProcessing || !j.ParsedResults?.length) {
    const m = Array.isArray(j.ErrorMessage) ? j.ErrorMessage.join(" ") : j.ErrorMessage;
    if (m && /limit|quota|exceed|too many|rate/i.test(m)) throw new OcrQuotaError(m);
    throw new Error(m ? `OCR gagal: ${m}` : "OCR tidak menemukan teks");
  }
  return j.ParsedResults.map((p) => p.ParsedText ?? "").join("\n");
}

/**
 * Engine 2 dulu (cepat); bila angka yang dicari tidak valid, coba Engine 3 (lebih teliti, kuota terpisah) dan ambil yang lebih baik.
 */
export async function readIdPhoto(file: Blob, name: string, kind: "ktp" | "kk" | "stnk", key: string, gate?: (engine: 2 | 3) => Promise<boolean>) {
  const table = kind === "kk";
  // nilai mutu bacaan: KTP/KK 10 bila nomornya valid, 5 bila terbaca tapi janggal; STNK = jumlah dari 6 data yang berhasil dibaca
  const score = (t: string) => (kind === "ktp" ? (parseKtp(t).nik?.valid ? 10 : parseKtp(t).nik ? 5 : 0) : kind === "kk" ? (parseKk(t).kk?.valid ? 10 : parseKk(t).kk ? 5 : 0) : stnkScore(parseStnk(t)));
  const enough = (t: string) => score(t) >= (kind === "stnk" ? 5 : 10);
  if (gate && !(await gate(2))) throw new OcrQuotaError("Kuota gratis OCR habis");
  let text = await ocr(file, name, key, 2, table);
  if (!enough(text) && (!gate || (await gate(3)))) {
    try {
      const t3 = await ocr(file, name, key, 3, table);
      if (score(t3) > score(text)) text = t3;
    } catch (e) {
      if (e instanceof OcrQuotaError) throw e;
      /* Engine 3 sedang sibuk: pakai hasil Engine 2 */
    }
  }
  return kind === "ktp" ? { kind, ...parseKtp(text) } : kind === "kk" ? { kind, ...parseKk(text) } : { kind, ...parseStnk(text) };
}
