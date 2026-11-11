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
  if (labelled) return { nik: checkNik(labelled), others: all.filter((x) => x !== labelled).map(checkNik) };
  const valid = all.filter((x) => checkNik(x).valid);
  if (valid.length === 1) return { nik: checkNik(valid[0]), others: all.filter((x) => x !== valid[0]).map(checkNik) };
  return { nik: null, others: all.map(checkNik) };
}

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
  if (!res.ok) throw new Error(`OCR.space membalas ${res.status}`);
  const j = (await res.json()) as OcrResponse;
  if (j.IsErroredOnProcessing || !j.ParsedResults?.length) {
    const m = Array.isArray(j.ErrorMessage) ? j.ErrorMessage.join(" ") : j.ErrorMessage;
    throw new Error(m ? `OCR gagal: ${m}` : "OCR tidak menemukan teks");
  }
  return j.ParsedResults.map((p) => p.ParsedText ?? "").join("\n");
}

/**
 * Engine 2 dulu (cepat); bila angka yang dicari tidak valid, coba Engine 3 (lebih teliti, kuota terpisah) dan ambil yang lebih baik.
 */
export async function readIdPhoto(file: Blob, name: string, kind: "ktp" | "kk", key: string) {
  const table = kind === "kk";
  const good = (t: string) => (kind === "ktp" ? parseKtp(t).nik?.valid : parseKk(t).kk?.valid);
  let text = await ocr(file, name, key, 2, table);
  if (!good(text)) {
    try {
      const t3 = await ocr(file, name, key, 3, table);
      if (good(t3) || !good(text)) text = good(t3) ? t3 : text.length >= t3.length ? text : t3;
    } catch {
      /* Engine 3 kuotanya terpisah atau sedang sibuk: pakai hasil Engine 2 */
    }
  }
  return kind === "ktp" ? { kind, ...parseKtp(text) } : { kind, ...parseKk(text) };
}
