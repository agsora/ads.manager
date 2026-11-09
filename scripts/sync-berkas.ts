/**
 * Sinkron menu "Berkas In": membaca (hanya SELECT) berkas Digital Marketing dari database Konvensional dan Syariah,
 * lalu menyimpannya ke tabel berkas_in di database aplikasi ini.
 *
 *   npm run sync:berkas                (workspace dari BERKAS_ORG_ID di .env.local)
 *   npm run sync:berkas -- --org 6     (workspace tertentu)
 *
 * Berkas Digital Marketing =
 *   Konvensional: Applications.surveyor_id (CMO) berasal dari user bernama "Digital Marketing"
 *   Syariah     : tblproduk_cicilan.asal_aplikasi mengandung "digital", atau CMO taksirnya bernama "Digital Marketing"
 *
 * Database sumber hanya terjangkau lewat tunnel SSH dari PC kantor, sama seperti proyek dashboard, jadi skrip ini
 * dijalankan lokal. DATABASE_URL_KONVENSIONAL / DATABASE_URL_SYARIAH / SSH_TUNNEL_* dibaca dari .env.local proyek ini,
 * atau (bila belum ada) dari .env.local proyek dashboard (DASHBOARD_ENV), tanpa menyalin atau mencetak nilainya.
 */
import { config, parse } from "dotenv";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import { Client } from "pg";

config({ path: ".env.local" });
const SRC_KEYS = ["DATABASE_URL_KONVENSIONAL", "DATABASE_URL_SYARIAH", "SSH_TUNNEL_KONVENSIONAL", "SSH_TUNNEL_SYARIAH"];
const dashEnv = process.env.DASHBOARD_ENV ?? "C:/coding/dashboard/.env.local";
if (existsSync(dashEnv)) {
  const other = parse(readFileSync(dashEnv));
  for (const k of SRC_KEYS) if (!process.env[k] && other[k]) process.env[k] = other[k];
}

type Seg = "konvensional" | "syariah";
const LOCAL_PORT: Record<Seg, number> = { konvensional: 15432, syariah: 15433 };
const tunnels: ChildProcess[] = [];

const portOpen = (port: number) =>
  new Promise<boolean>((ok) => {
    const s = net.connect({ host: "127.0.0.1", port, timeout: 1000 });
    s.on("connect", () => (s.destroy(), ok(true)));
    s.on("timeout", () => (s.destroy(), ok(false)));
    s.on("error", () => ok(false));
  });

/** URL ke ujung lokal tunnel SSH (alias di ~/.ssh/config); tanpa alias dipakai URL aslinya. */
async function sourceUrl(seg: Seg): Promise<string> {
  const original = process.env[`DATABASE_URL_${seg.toUpperCase()}`];
  if (!original) throw new Error(`DATABASE_URL_${seg.toUpperCase()} belum diisi`);
  const alias = process.env[`SSH_TUNNEL_${seg.toUpperCase()}`];
  if (!alias) return original;
  const target = new URL(original);
  const port = LOCAL_PORT[seg];
  if (!(await portOpen(port))) {
    let stderr = "";
    const proc = spawn("ssh", ["-N", "-C", "-o", "BatchMode=yes", "-o", "ExitOnForwardFailure=yes", "-o", "ServerAliveInterval=30", "-o", "ConnectTimeout=15", "-L", `${port}:${target.hostname}:${target.port || 5432}`, alias], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    proc.stderr?.on("data", (d) => (stderr += String(d)));
    tunnels.push(proc);
    const until = Date.now() + 25_000;
    while (!(await portOpen(port))) {
      if (proc.exitCode !== null || Date.now() > until) throw new Error(`tunnel SSH ${alias} gagal: ${stderr.trim() || "tidak siap dalam 25 detik"}`);
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  const local = new URL(original);
  local.hostname = "127.0.0.1";
  local.port = String(port);
  return local.toString();
}

/** Jalankan satu SELECT hanya-baca di DB sumber. */
async function select(seg: Seg, text: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const url = await sourceUrl(seg);
  const c = new Client({
    connectionString: url.replace(/[?&]sslmode=[^&]*/g, ""),
    ssl: /sslmode=disable/.test(url) ? false : { rejectUnauthorized: false }, // server Syariah lama tanpa SSL; Konvensional SSL lewat tunnel
    connectionTimeoutMillis: 15000,
  });
  c.on("error", () => {});
  await c.connect();
  try {
    await c.query("SET default_transaction_read_only = on");
    return (await c.query(text, params)).rows;
  } finally {
    await c.end().catch(() => {});
  }
}

const JKT = (col: string) => `(${col} AT TIME ZONE 'Asia/Jakarta')::date`;

/**
 * Konvensional: (1) berkas yang CMO-nya Digital Marketing, (2) berkas yang diinput ulang SETELAH itu dengan NIK yang sama
 * (NIK pemohon atau NIK pasangan, silang) dalam 30 hari. Untuk (2) dipakai berkas Digital Marketing terdekat sebelumnya.
 * Dilengkapi data pemohon, CMO/surveyor, cabang, dealer, survei, dan kontrak.
 */
const SQL_KONVEN = `
  WITH dm AS (
    SELECT a.id, a."createdAt" AS dibuat,
           regexp_replace(COALESCE(bu.ktp_number, ''), '\\D', '', 'g') AS nik_p,
           regexp_replace(COALESCE(a.partner_ktp_number, ''), '\\D', '', 'g') AS nik_s
    FROM   "Applications" a
    JOIN   "Users" cmo ON cmo.id = a.surveyor_id AND cmo.full_name ILIKE '%digital marketing%'
    LEFT   JOIN "Users" bu ON bu.id = a.user_id
  ),
  dm_nik AS (
    SELECT d.id, d.dibuat, v.nik, v.peran
    FROM   dm d
    CROSS  JOIN LATERAL (VALUES (d.nik_p, 'pemohon'), (d.nik_s, 'pasangan')) AS v(nik, peran)
    WHERE  length(v.nik) = 16
  ),
  cand AS (
    SELECT a2.id, a2."createdAt" AS dibuat,
           regexp_replace(COALESCE(bu2.ktp_number, ''), '\\D', '', 'g') AS nik_p,
           regexp_replace(COALESCE(a2.partner_ktp_number, ''), '\\D', '', 'g') AS nik_s
    FROM   "Applications" a2
    LEFT   JOIN "Users" bu2 ON bu2.id = a2.user_id
    WHERE  a2."createdAt" >= (SELECT min(dibuat) FROM dm)
      AND  a2.id NOT IN (SELECT id FROM dm)
  ),
  ulang AS (
    SELECT DISTINCT ON (c.id) c.id, d.id AS ref_dm, d.peran AS peran_dm,
           CASE WHEN d.nik = c.nik_p THEN 'pemohon' ELSE 'pasangan' END AS peran_baru,
           GREATEST(c.dibuat::date - d.dibuat::date, 0) AS hari
    FROM   cand c
    JOIN   dm_nik d ON c.dibuat > d.dibuat AND c.dibuat <= d.dibuat + interval '30 days'
                   AND (d.nik = c.nik_p OR d.nik = c.nik_s)
    ORDER  BY c.id, d.dibuat DESC
  ),
  sel AS (
    SELECT id, 'Digital Marketing' AS tipe, NULL::int AS ref_dm, NULL::int AS hari, NULL::text AS nik_cocok FROM dm
    UNION ALL
    SELECT id, 'Input ulang', ref_dm, hari::int, 'NIK ' || peran_baru || ' sama dengan NIK ' || peran_dm || ' berkas Digital Marketing' FROM ulang
  )
  SELECT a.id::text AS source_id,
         sel.tipe AS tipe_masuk,
         CASE WHEN sel.tipe = 'Digital Marketing' THEN 'Digital Marketing' ELSE 'Input ulang NIK sama' END AS asal,
         sel.ref_dm::text AS ref_dm, sel.hari, sel.nik_cocok,
         ${JKT('a."createdAt"')} AS tgl_masuk,
         a.status,
         a.application_type
           || CASE WHEN a.application_type = 'Honda' THEN '' WHEN COALESCE(a.is_car, false) THEN ' R4' ELSE ' R2' END AS jenis,
         ${JKT("a.approve_reject_date")} AS tgl_keputusan,
         a.approve_or_reject_reason AS alasan,
         bu.full_name AS nama, bu.phone_number AS phone,
         cmo.full_name AS cmo, rev.full_name AS surveyor,
         ci.name AS cabang, d.dealer_name AS dealer,
         NULLIF(trim(COALESCE(m.collateral_brand, '') || ' ' || COALESCE(m.collateral_year::text, '')), '') AS unit,
         m.collateral_market_price AS harga_pasar, m.down_payment AS dp,
         COALESCE(ca.tenor, m.tenor) AS tenor, COALESCE(ca.installment, m.installment) AS angsuran, -- kontrak bila sudah ada, kalau belum angka usulan CMO
         ca.contract_number AS no_kontrak, ca.status AS status_kontrak,
         ${JKT("k.contract_date")} AS tgl_cair,
         ca.initial_outstanding AS pokok,
         -- hanya dipakai untuk cek ke Syariah (cabang Aceh), tidak disimpan
         ci.area AS _area,
         regexp_replace(COALESCE(bu.ktp_number, ''), '\\D', '', 'g') AS _nik_p,
         regexp_replace(COALESCE(a.partner_ktp_number, ''), '\\D', '', 'g') AS _nik_s
  FROM   sel
  JOIN   "Applications" a ON a.id = sel.id
  LEFT   JOIN "Users"  cmo ON cmo.id = a.surveyor_id
  LEFT   JOIN "Users"  bu  ON bu.id  = a.user_id
  LEFT   JOIN "Users"  rev ON rev.id = a.reviewer_id
  LEFT   JOIN "Cities" ci  ON ci.id  = a.city_id
  LEFT   JOIN "Dealers" d  ON d.id   = a.dealer_id
  LEFT   JOIN LATERAL (SELECT * FROM "ApplicationCMOs"      WHERE application_id = a.id ORDER BY id DESC LIMIT 1) m ON true
  LEFT   JOIN LATERAL (SELECT * FROM "ApplicationContracts" WHERE application_id = a.id ORDER BY id DESC LIMIT 1) k ON true
  LEFT   JOIN LATERAL (SELECT * FROM "CapellaApplications"  WHERE application_id = a.id ORDER BY "createdAt" DESC LIMIT 1) ca ON true
  ORDER  BY a."createdAt" DESC`;

/** Syariah: kontrak/pengajuan yang Asal Aplikasi-nya Digital Marketing, atau CMO taksirnya bernama Digital Marketing. */
const SQL_SYARIAH = `
  SELECT p.no_sbg AS source_id,
         ${JKT("p.tgl_pengajuan")} AS tgl_masuk,
         p.status_approval AS status,
         p.status_aplikasi AS jenis,
         p.asal_aplikasi AS asal,
         COALESCE(${JKT("p.tgl_approve")}, ${JKT("p.tgl_batal")}) AS tgl_keputusan,
         p.alasan,
         cu.nm_customer AS nama, cu.no_hp AS phone,
         trim(COALESCE(kc.nm_depan, '') || ' ' || COALESCE(kc.nm_belakang, '')) AS cmo,
         cb.nm_cabang AS cabang,
         p.total_nilai_pinjaman AS pokok, p.lama_pinjaman AS tenor, p.angsuran_bulan AS angsuran,
         p.no_sbg AS no_kontrak, p.status_data AS status_kontrak,
         ${JKT("p.tgl_cair")} AS tgl_cair
  FROM   data_gadai.tblproduk_cicilan p
  LEFT   JOIN data_gadai.tbltaksir_umum t ON t.no_fatg = p.fk_fatg
  LEFT   JOIN public.tblcustomer cu ON cu.no_cif = t.fk_cif
  LEFT   JOIN public.tblkaryawan kc ON kc.npk = t.fk_karyawan_cmo
  LEFT   JOIN public.tblcabang  cb ON cb.kd_cabang = t.fk_cabang
  WHERE  p.asal_aplikasi ILIKE '%digital%'
     OR  (COALESCE(kc.nm_depan, '') || ' ' || COALESCE(kc.nm_belakang, '')) ILIKE '%digital marketing%'
  ORDER  BY p.tgl_pengajuan DESC`;

/**
 * Cek NIK di database Syariah (hanya untuk cabang Aceh): nasabah yang NIK-nya (atau NIK pasangannya) sama dengan NIK pemohon
 * atau pasangan di berkas, beserta kontrak Syariah-nya: status, tanggal pengajuan/cair, pokok, sisa pokok, angsuran terbayar, keterlambatan.
 * Query Syariah (PostgreSQL 8.2) sengaja tanpa CTE, unnest, LATERAL, atau fungsi window.
 */
const digits16 = (v: unknown) => {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length === 16 ? d : "";
};
const rp = (v: unknown) => `Rp ${Math.round(Number(v) || 0).toLocaleString("id-ID")}`;
const day = (v: unknown) => (v ? new Date(v as string).toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" }) : "");

async function syariahByNik(niks: string[]) {
  const nikC = `regexp_replace(COALESCE(cu.no_id, ''), '\\D', '', 'g')`;
  const nikP = `regexp_replace(COALESCE(cu.no_ktp_pasangan, ''), '\\D', '', 'g')`;
  const customers = await select(
    "syariah",
    `SELECT cu.no_cif, cu.nm_customer, ${nikC} AS nik_c, ${nikP} AS nik_ps
     FROM   public.tblcustomer cu
     WHERE  ${nikC} = ANY($1) OR ${nikP} = ANY($1)`,
    [niks],
  );
  if (!customers.length) return { customers, contracts: [] as Record<string, unknown>[] };
  const contracts = await select(
    "syariah",
    `SELECT t.fk_cif AS no_cif, p.no_sbg, p.status_approval, p.status_data, p.tgl_pengajuan, p.tgl_cair, p.tgl_batal, p.tgl_wo,
            p.total_nilai_pinjaman, p.lama_pinjaman, p.angsuran_bulan,
            (SELECT COALESCE(sum(a.pokok_jt), 0) FROM data_fa.tblangsuran a WHERE a.fk_sbg = p.no_sbg AND a.tgl_bayar IS NULL) AS os_pokok,
            (SELECT count(*) FROM data_fa.tblangsuran a WHERE a.fk_sbg = p.no_sbg) AS n_angsuran,
            (SELECT count(*) FROM data_fa.tblangsuran a WHERE a.fk_sbg = p.no_sbg AND a.tgl_bayar IS NOT NULL) AS n_bayar,
            (SELECT min(a.tgl_jatuh_tempo) FROM data_fa.tblangsuran a WHERE a.fk_sbg = p.no_sbg AND a.tgl_bayar IS NULL AND a.tgl_jatuh_tempo < now()) AS jt_telat
     FROM   data_gadai.tbltaksir_umum t
     JOIN   data_gadai.tblproduk_cicilan p ON p.fk_fatg = t.no_fatg
     WHERE  t.fk_cif = ANY($1)
     ORDER  BY p.tgl_pengajuan DESC`,
    [customers.map((c) => String(c.no_cif))],
  );
  return { customers, contracts };
}

/** Ringkasan Syariah untuk satu berkas Aceh: { cek, detail }. */
function syariahSummary(row: Record<string, unknown>, look: Awaited<ReturnType<typeof syariahByNik>>) {
  const p = digits16(row._nik_p);
  const s = digits16(row._nik_s);
  const lines: string[] = [];
  for (const c of look.customers) {
    const roles: string[] = [];
    if (p && c.nik_c === p) roles.push("pemohon = nasabah Syariah");
    if (p && c.nik_ps === p) roles.push("pemohon = pasangan nasabah Syariah");
    if (s && c.nik_c === s) roles.push("pasangan = nasabah Syariah");
    if (s && c.nik_ps === s) roles.push("pasangan = pasangan nasabah Syariah");
    if (!roles.length) continue;
    const mine = look.contracts.filter((k) => k.no_cif === c.no_cif);
    lines.push(`NIK cocok (${roles.join(", ")}): ${c.nm_customer} · CIF ${c.no_cif} · ${mine.length} kontrak Syariah`);
    for (const k of mine) {
      const os = Number(k.os_pokok) || 0; // sisa pokok = pokok angsuran yang belum dibayar (kolom sisa_pokok kontrak tidak diisi untuk kontrak baru)
      const paidOff = Number(k.n_angsuran) > 0 && Number(k.n_bayar) >= Number(k.n_angsuran);
      const late = k.jt_telat ? Math.max(0, Math.floor((Date.now() - new Date(k.jt_telat as string).getTime()) / 86400000)) : 0;
      const state = k.tgl_batal || k.status_approval === "Batal" ? "Batal" : k.tgl_wo ? "WO" : k.tgl_cair && paidOff ? "Lunas" : k.tgl_cair ? "Berjalan" : String(k.status_approval ?? k.status_data ?? "");
      lines.push(
        `  • SBG ${k.no_sbg} · ${state} · pengajuan ${day(k.tgl_pengajuan)}${k.tgl_cair ? ` · cair ${day(k.tgl_cair)}` : ""} · pinjaman ${rp(k.total_nilai_pinjaman)}${k.tgl_cair ? ` · sisa pokok ${rp(os)}` : ""}` +
          (Number(k.n_angsuran) ? ` · ${k.n_bayar}/${k.n_angsuran} angsuran terbayar` : "") +
          (late ? ` · telat ${late} hari` : ""),
      );
    }
  }
  if (!p && !s) return { cek: "NIK tidak valid, tidak bisa dicek", detail: null as string | null };
  return lines.length ? { cek: "Ada di Syariah", detail: lines.join("\n") } : { cek: "Tidak ada di Syariah", detail: null };
}

async function main() {
  const argOrg = process.argv.indexOf("--org");
  const org = Number(argOrg > 0 ? process.argv[argOrg + 1] : process.env.BERKAS_ORG_ID);
  if (!Number.isInteger(org) || org <= 0) throw new Error("Workspace tujuan belum ditentukan: pakai --org <id> atau isi BERKAS_ORG_ID di .env.local");
  const onlyIfRequested = process.argv.includes("--if-requested");

  const { RESOURCE_MAP } = await import("../src/lib/resources");
  const { cleanInput, deleteMatching, insertMany } = await import("../src/lib/repo");
  const { getSetting, logActivity, q, setSetting } = await import("../src/lib/db");
  const r = RESOURCE_MAP.berkas;

  // status sinkron di database aplikasi: tombol "Sinkron" di menu hanya menaruh permintaan (requestedAt),
  // komputer kantor yang memeriksanya tiap beberapa menit (--if-requested) lalu menjalankan sinkron ini
  const statusKey = `berkas_sync:${org}`;
  const status = async () => {
    try {
      return JSON.parse((await getSetting(statusKey)) ?? "{}") as Record<string, unknown>;
    } catch {
      return {};
    }
  };
  const before = await status();
  if (onlyIfRequested) {
    const pending = before.requestedAt && (!before.finishedAt || String(before.finishedAt) < String(before.requestedAt));
    const busy = before.running && before.startedAt && Date.now() - new Date(String(before.startedAt)).getTime() < 20 * 60_000;
    if (!pending || busy) {
      console.log(!pending ? "Tidak ada permintaan sinkron." : "Sinkron sedang berjalan.");
      return;
    }
  }
  await setSetting(statusKey, JSON.stringify({ ...before, running: true, startedAt: new Date().toISOString() }));

  const segments: { seg: Seg; label: string; sql: string; asal: string }[] = [
    { seg: "konvensional", label: "Konvensional", sql: SQL_KONVEN, asal: "Digital Marketing" },
    { seg: "syariah", label: "Syariah", sql: SQL_SYARIAH, asal: "" },
  ];
  let total = 0;
  const notes: string[] = [];
  for (const s of segments) {
    let src: Record<string, unknown>[];
    try {
      src = await select(s.seg, s.sql);
    } catch (e) {
      notes.push(`${s.label}: GAGAL dibaca, data lama dipertahankan (${(e as Error).message})`);
      continue;
    }

    // cabang Aceh: cek NIK pemohon/pasangan di database Syariah untuk tahu detailnya
    const aceh = src.filter((x) => /aceh/i.test(String(x._area ?? "")));
    const niks = [...new Set(aceh.flatMap((x) => [digits16(x._nik_p), digits16(x._nik_s)]).filter(Boolean))];
    let look: Awaited<ReturnType<typeof syariahByNik>> | null = null;
    if (niks.length) {
      try {
        look = await syariahByNik(niks);
      } catch (e) {
        notes.push(`Cek NIK Aceh ke Syariah GAGAL, hasil lama dipertahankan (${(e as Error).message})`);
      }
    }
    const oldSy = new Map<string, { syariah_cek: unknown; syariah_detail: unknown }>();
    if (!look && aceh.length)
      for (const o of await q<{ source_id: string; syariah_cek: unknown; syariah_detail: unknown }>(`SELECT source_id, syariah_cek, syariah_detail FROM berkas_in WHERE org_id = $1 AND segment = $2`, [org, s.label])) oldSy.set(o.source_id, o);
    let found = 0;

    const rows = src.map((x) => {
      const isAceh = /aceh/i.test(String(x._area ?? ""));
      let sy: { syariah_cek: unknown; syariah_detail: unknown } = { syariah_cek: null, syariah_detail: null };
      if (isAceh && look) {
        const m = syariahSummary(x, look);
        sy = { syariah_cek: m.cek, syariah_detail: m.detail };
        if (m.cek === "Ada di Syariah") found++;
      } else if (isAceh) sy = oldSy.get(String(x.source_id)) ?? sy;
      const o = cleanInput(r, { ...x, ...sy, segment: s.label, asal: x.asal || s.asal, tipe_masuk: x.tipe_masuk ?? "Digital Marketing" }, true);
      for (const f of r.fields) if (!(f.key in o)) o[f.key] = null;
      return o;
    });
    // hanya yang cocok saat ini: baris lama yang sudah tidak masuk kriteria (mis. CMO diganti) ikut dihapus
    await deleteMatching(org, r, rows);
    if (rows.length) total += await insertMany(org, r, rows);
    const ids = rows.map((x) => String(x.source_id));
    const gone = await q(`DELETE FROM berkas_in WHERE org_id = $1 AND segment = $2 AND NOT (source_id = ANY($3::text[])) RETURNING id`, [org, s.label, ids]);
    notes.push(`${s.label}: ${rows.length} berkas${gone.length ? `, ${gone.length} baris lama dihapus karena tidak cocok lagi` : ""}${aceh.length && look ? `; cabang Aceh ${aceh.length} berkas dicek ke Syariah, ${found} ada di Syariah` : ""}`);
  }
  const failed = notes.every((x) => x.includes("GAGAL dibaca"));
  if (failed) process.exitCode = 1; // jadwal harian harus kelihatan gagal bila tidak ada yang terbaca
  const now = new Date().toISOString();
  await setSetting(statusKey, JSON.stringify({ ...(await status()), running: false, finishedAt: now, ok: !failed, total, note: notes.join(" | ").slice(0, 600) }));
  await logActivity(org, "Sinkron Berkas In", "Sinkron berkas", notes.join(" | "));
  console.log(`Selesai (workspace ${org}): ${total} berkas ditulis.\n- ${notes.join("\n- ")}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const t of tunnels) t.kill();
    setTimeout(() => process.exit(), 200);
  });
