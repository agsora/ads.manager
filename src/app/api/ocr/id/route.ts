import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/db";
import { OcrQuotaError, readIdPhoto } from "@/lib/id-ocr";
import { ocrMarkExhausted, ocrQuota, ocrReserve } from "@/lib/ocr-quota";

export const maxDuration = 60;

const MAX_BYTES = 1_000_000; // batas file paket gratis OCR.space: 1 MB (browser mengecilkan foto sebelum dikirim)

/** GET → pemakaian kuota gratis OCR saat ini. */
export const GET = handle(async () => {
  await requireSession();
  return NextResponse.json(await ocrQuota());
});

/**
 * POST multipart { file, kind: "ktp" | "kk" } → NIK dari foto KTP, atau No. KK dan NIK anggota dari foto KK.
 * Foto dan teks mentah tidak disimpan maupun dicatat; log aktivitas hanya mencatat bahwa pembacaan dilakukan.
 * Setiap permintaan ke OCR.space dijaga penghitung kuota gratis (lib/ocr-quota.ts) supaya tidak pernah melewati paket gratis.
 */
export const POST = handle(async (req: Request) => {
  const s = await requireSession(["owner", "admin", "superadmin", "staff"]);
  const key = process.env.OCR_SPACE_KEY;
  if (!key) throw new HttpError(500, "Kunci OCR belum diatur (OCR_SPACE_KEY)");
  const form = await req.formData();
  const kind = form.get("kind") === "kk" ? "kk" : "ktp";
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw new HttpError(400, "Foto belum dipilih");
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new HttpError(400, "Format foto harus JPG, PNG, atau WebP");
  if (file.size > MAX_BYTES) throw new HttpError(413, "Foto lebih dari 1 MB. Coba foto lain atau kecilkan dulu");
  try {
    // setiap permintaan ke OCR.space dipesan dulu ke penghitung kuota gratis; bila penuh, tidak dikirim sama sekali
    const result = await readIdPhoto(file, file.name || `${kind}.jpg`, kind, key, (engine) => ocrReserve(engine, s.org));
    await logActivity(s.org, s.name, kind === "ktp" ? "Baca foto KTP (OCR)" : "Baca foto KK (OCR)");
    return NextResponse.json({ ...result, quota: await ocrQuota() });
  } catch (e) {
    if (e instanceof OcrQuotaError) {
      if (!/gratis OCR habis/.test(e.message)) await ocrMarkExhausted(s.org, e.message);
      throw new HttpError(429, "Kuota gratis OCR habis untuk sementara (bulan ini atau hari ini). Ketik NIK dan No. KK manual; admin sudah diberi notifikasi.");
    }
    throw new HttpError(502, (e as Error).message || "OCR gagal");
  }
});
