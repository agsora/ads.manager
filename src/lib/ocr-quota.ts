import { getSetting, q, setSetting } from "./db";
import { notify } from "./notify";

/**
 * Batas paket gratis OCR.space: 25.000 permintaan per bulan, 500 per hari per IP, dan kuota Engine 3 terpisah 1.000 per bulan.
 * Pemakaian dicatat di sini dan dikunci sebelum menyentuh batas, supaya fitur baca KTP/KK tidak pernah melewati paket gratis.
 * Peringatan masuk ke notifikasi pemilik/admin di 80% dan saat batas tercapai.
 */
export const OCR_FREE = { month: 25_000, engine3Month: 1_000, day: 500 } as const;
const WARN = 0.8;

interface Usage {
  e2: number;
  e3: number;
  days: Record<string, number>;
  flags: Record<string, boolean>;
}

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
const keyOf = (day: string) => `ocr_usage:${day.slice(0, 7)}`;

async function load(day: string): Promise<Usage> {
  try {
    const u = JSON.parse((await getSetting(keyOf(day))) ?? "null") as Usage | null;
    if (u) return { e2: u.e2 ?? 0, e3: u.e3 ?? 0, days: u.days ?? {}, flags: u.flags ?? {} };
  } catch {
    /* mulai baru */
  }
  return { e2: 0, e3: 0, days: {}, flags: {} };
}

export interface OcrQuota {
  month: { used: number; limit: number };
  engine3: { used: number; limit: number };
  day: { used: number; limit: number };
}

const view = (u: Usage, day: string): OcrQuota => ({
  month: { used: u.e2 + u.e3, limit: OCR_FREE.month },
  engine3: { used: u.e3, limit: OCR_FREE.engine3Month },
  day: { used: u.days[day] ?? 0, limit: OCR_FREE.day },
});

export async function ocrQuota(): Promise<OcrQuota> {
  const d = today();
  return view(await load(d), d);
}

async function alert(orgId: number, title: string, body: string) {
  try {
    const admins = await q<{ id: number }>(`SELECT id FROM users WHERE org_id = $1 AND role IN ('owner', 'admin', 'superadmin')`, [orgId]);
    if (!admins.length) return;
    await notify({ orgId, category: "alerts", title, body, link: "/leads", skipActor: false, userIds: admins.map((a) => a.id), email: { subject: title, eyebrow: "Kuota OCR", intro: body } });
  } catch {
    /* peringatan gagal terkirim tidak boleh menggagalkan pembacaan foto */
  }
}

/**
 * Pesan satu permintaan OCR. Mengembalikan false bila permintaan itu akan melewati batas gratis (tidak dihitung dan tidak boleh dikirim).
 * Engine 2 dan 3 sama-sama dihitung ke batas bulanan dan harian; Engine 3 punya batas bulanan sendiri.
 */
export async function ocrReserve(engine: 2 | 3, orgId: number): Promise<boolean> {
  const d = today();
  const u = await load(d);
  const v = view(u, d);
  const monthFull = v.month.used >= v.month.limit;
  const dayFull = v.day.used >= v.day.limit;
  const e3Full = engine === 3 && v.engine3.used >= v.engine3.limit;
  const blocked = monthFull || dayFull || e3Full;

  if (blocked) {
    const flag = monthFull ? `m100` : dayFull ? `d100:${d}` : `e3100`;
    if (!u.flags[flag]) {
      u.flags[flag] = true;
      await setSetting(keyOf(d), JSON.stringify(u));
      if (monthFull) await alert(orgId, "Kuota OCR gratis bulan ini habis", `Pembacaan foto KTP/KK memakai ${v.month.used.toLocaleString("id-ID")} dari ${v.month.limit.toLocaleString("id-ID")} permintaan gratis bulan ini. Fitur dihentikan sampai bulan depan supaya tetap gratis; NIK dan No. KK tetap bisa diketik manual.`);
      else if (dayFull) await alert(orgId, "Batas harian OCR gratis tercapai", `Sudah ${v.day.used} dari ${v.day.limit} pembacaan foto hari ini. Pembacaan lanjut besok; NIK dan No. KK tetap bisa diketik manual.`);
      else await alert(orgId, "Kuota Engine 3 OCR gratis habis", `Kuota Engine 3 bulan ini (${v.engine3.limit.toLocaleString("id-ID")}) habis. Pembacaan tetap berjalan dengan Engine 2.`);
    }
    return false;
  }

  u.days[d] = (u.days[d] ?? 0) + 1;
  if (engine === 2) u.e2++;
  else u.e3++;
  const after = view(u, d);
  const warn: [string, boolean, string, string][] = [
    [`m80`, after.month.used >= after.month.limit * WARN, "Kuota OCR gratis bulan ini 80% terpakai", `Sudah ${after.month.used.toLocaleString("id-ID")} dari ${after.month.limit.toLocaleString("id-ID")} permintaan gratis bulan ini. Setelah penuh, fitur baca foto KTP/KK berhenti otomatis (tidak ada biaya).`],
    [`d80:${d}`, after.day.used >= after.day.limit * WARN, "Batas harian OCR gratis hampir tercapai", `Sudah ${after.day.used} dari ${after.day.limit} pembacaan foto hari ini.`],
    [`e380`, after.engine3.used >= after.engine3.limit * WARN, "Kuota Engine 3 OCR gratis 80% terpakai", `Sudah ${after.engine3.used} dari ${after.engine3.limit.toLocaleString("id-ID")} pembacaan Engine 3 bulan ini.`],
  ];
  const fire = warn.filter(([f, hit]) => hit && !u.flags[f]);
  for (const [f] of fire) u.flags[f] = true;
  await setSetting(keyOf(d), JSON.stringify(u));
  for (const [, , title, body] of fire) await alert(orgId, title, body);
  return true;
}

/** OCR.space sendiri menolak karena kuota (mis. batas harian per IP): hentikan sampai besok dan beri tahu admin. */
export async function ocrMarkExhausted(orgId: number, message: string) {
  const d = today();
  const u = await load(d);
  u.days[d] = Math.max(u.days[d] ?? 0, OCR_FREE.day);
  const flag = `d100:${d}`;
  const first = !u.flags[flag];
  u.flags[flag] = true;
  await setSetting(keyOf(d), JSON.stringify(u));
  if (first) await alert(orgId, "OCR.space menolak: batas gratis tercapai", `Pembacaan foto dihentikan sampai besok. Pesan dari OCR.space: ${message.slice(0, 200)}`);
}
