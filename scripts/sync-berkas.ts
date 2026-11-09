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
async function select(seg: Seg, text: string): Promise<Record<string, unknown>[]> {
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
    return (await c.query(text)).rows;
  } finally {
    await c.end().catch(() => {});
  }
}

const JKT = (col: string) => `(${col} AT TIME ZONE 'Asia/Jakarta')::date`;

/** Konvensional: berkas yang CMO-nya Digital Marketing, dengan data pemohon, CMO/surveyor, cabang, dealer, survei, dan kontrak. */
const SQL_KONVEN = `
  SELECT a.id::text AS source_id,
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
         ca.initial_outstanding AS pokok
  FROM   "Applications" a
  JOIN   "Users" cmo ON cmo.id = a.surveyor_id AND cmo.full_name ILIKE '%digital marketing%'
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

async function main() {
  const argOrg = process.argv.indexOf("--org");
  const org = Number(argOrg > 0 ? process.argv[argOrg + 1] : process.env.BERKAS_ORG_ID);
  if (!Number.isInteger(org) || org <= 0) throw new Error("Workspace tujuan belum ditentukan: pakai --org <id> atau isi BERKAS_ORG_ID di .env.local");

  const { RESOURCE_MAP } = await import("../src/lib/resources");
  const { cleanInput, deleteMatching, insertMany } = await import("../src/lib/repo");
  const { logActivity, q } = await import("../src/lib/db");
  const r = RESOURCE_MAP.berkas;

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
    const rows = src.map((x) => {
      const o = cleanInput(r, { ...x, segment: s.label, asal: x.asal || s.asal }, true);
      for (const f of r.fields) if (!(f.key in o)) o[f.key] = null;
      return o;
    });
    // hanya yang cocok saat ini: baris lama yang sudah tidak masuk kriteria (mis. CMO diganti) ikut dihapus
    await deleteMatching(org, r, rows);
    if (rows.length) total += await insertMany(org, r, rows);
    const ids = rows.map((x) => String(x.source_id));
    const gone = await q(`DELETE FROM berkas_in WHERE org_id = $1 AND segment = $2 AND NOT (source_id = ANY($3::text[])) RETURNING id`, [org, s.label, ids]);
    notes.push(`${s.label}: ${rows.length} berkas${gone.length ? `, ${gone.length} baris lama dihapus karena tidak cocok lagi` : ""}`);
  }
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
