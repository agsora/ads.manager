/** Local office worker. Source databases are strictly read-only; only status columns in the app are updated. */
import { loadSourceEnv, sourceQuery, closeSourceTunnels } from "./source-db";
import { identity16, leadApprovalNiks, fallbackApprovalPhone, leadApproval, type ApprovalCandidate } from "../src/lib/lead-approval";
import { addDays } from "../src/lib/format";
import type { Row } from "../src/lib/resources";
import { findLeadIdentityLinks, normalizedSourcePhone } from "./lead-identity-links";

loadSourceEnv();
const dryRun = process.argv.includes("--dry-run");
const polling = process.argv.includes("--if-requested");
const arg = process.argv.indexOf("--org");
const orgFilter = arg >= 0 ? Number(process.argv[arg + 1]) : null;
if (orgFilter !== null && (!Number.isInteger(orgFilter) || orgFilter <= 0)) throw new Error("Workspace tidak valid");

async function candidates(leads: Row[]) {
  const valid = leads.filter((l) => (leadApprovalNiks(l).length || identity16(l.kk) || fallbackApprovalPhone(l)) && l.chat_date);
  const phones = [...new Set(valid.map(fallbackApprovalPhone).filter(Boolean))];
  const links = await findLeadIdentityLinks(phones);
  if (!valid.length) return { rows: [] as ApprovalCandidate[], links };
  const niks = [...new Set([...valid.flatMap(leadApprovalNiks), ...[...links.values()].flatMap((l) => l.niks)])];
  const kks = [...new Set([...valid.map((l) => identity16(l.kk)).filter(Boolean), ...[...links.values()].flatMap((l) => l.kks)])];
  const dates = valid.map((l) => String(l.chat_date).slice(0, 10)).sort();
  const params = [niks, kks, dates[0], addDays(dates[dates.length - 1], 30), phones];
  const normalizedPhone = normalizedSourcePhone;
  const [konven, syariah] = await Promise.all([
    sourceQuery("konvensional", `SELECT a.id::text AS reference,
      to_char((a."createdAt" AT TIME ZONE 'Asia/Jakarta')::date, 'YYYY-MM-DD') AS date, a.status,
      to_char(a."createdAt" AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS submitted_at,a.application_type AS financing_type,
      regexp_replace(COALESCE(u.ktp_number,''), '\\D', '', 'g') AS nik,
      regexp_replace(COALESCE(a.kk_number,''), '\\D', '', 'g') AS kk, u.phone_number AS phone,
      a.partner_ktp_number AS partner_nik, a.partner_phone AS partner_phone,
      s.partner_ktp_number AS sales_partner_nik,s.partner_phone AS sales_partner_phone,v.kk_number AS survey_kk
      FROM "Applications" a LEFT JOIN "Users" u ON u.id=a.user_id
      LEFT JOIN (SELECT DISTINCT ON(application_id) application_id,partner_ktp_number,partner_phone FROM "SalesAdditionalData" ORDER BY application_id,id DESC) s ON s.application_id=a.id
      LEFT JOIN (SELECT DISTINCT ON(application_id) application_id,kk_number FROM "SurveyorAdditionalData" ORDER BY application_id,id DESC) v ON v.application_id=a.id
      WHERE a.application_type='Dana Tunai'
      AND (a."createdAt" AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $3::date AND $4::date
      AND (regexp_replace(COALESCE(u.ktp_number,''), '\\D', '', 'g')=ANY($1::text[])
        OR regexp_replace(COALESCE(a.kk_number,''), '\\D', '', 'g')=ANY($2::text[])
        OR regexp_replace(COALESCE(a.partner_ktp_number,''), '\\D', '', 'g')=ANY($1::text[])
        OR ${normalizedPhone("u.phone_number")}=ANY($5::text[])
        OR ${normalizedPhone("a.partner_phone")}=ANY($5::text[])
        OR regexp_replace(COALESCE(s.partner_ktp_number,''), '\\D', '', 'g')=ANY($1::text[])
        OR regexp_replace(COALESCE(v.kk_number,''), '\\D', '', 'g')=ANY($2::text[])
        OR ${normalizedPhone("s.partner_phone")}=ANY($5::text[]))`, params),
    // Compatible with PostgreSQL 8.2: no CTE, unnest, LATERAL, or window functions.
    sourceQuery("syariah", `SELECT p.no_sbg AS reference, to_char(p.tgl_pengajuan,'YYYY-MM-DD') AS date,
      to_char(p.tgl_pengajuan, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS submitted_at,
      t.status_barang AS financing_type,p.fk_produk AS product,
      p.status_approval AS status, p.tgl_batal IS NOT NULL AS cancelled,
      regexp_replace(COALESCE(c.no_id,''), '\\D', '', 'g') AS nik,
      regexp_replace(COALESCE(c.no_kk,''), '\\D', '', 'g') AS kk, c.no_hp AS phone,
      c.no_ktp_pasangan AS partner_nik, c.no_hp_pasangan AS partner_phone,
      c.no_id_penjamin AS guarantor_nik, g.no_hp AS guarantor_phone, g.no_kk AS guarantor_kk
      FROM data_gadai.tblproduk_cicilan p
      JOIN data_gadai.tbltaksir_umum t ON t.no_fatg=p.fk_fatg
      JOIN public.tblcustomer c ON c.no_cif=t.fk_cif
      LEFT JOIN public.tblcustomer g ON regexp_replace(COALESCE(g.no_id,''), '\\D', '', 'g')=regexp_replace(COALESCE(c.no_id_penjamin,''), '\\D', '', 'g')
        AND length(regexp_replace(COALESCE(c.no_id_penjamin,''), '\\D', '', 'g'))=16
        AND regexp_replace(COALESCE(c.no_id_penjamin,''), '\\D', '', 'g')<>'0000000000000000'
      WHERE (upper(trim(t.status_barang))='DATUN' OR p.fk_produk IN ('22','42','44'))
      AND p.tgl_pengajuan::date BETWEEN $3::date AND $4::date
      AND (regexp_replace(COALESCE(c.no_id,''), '\\D', '', 'g')=ANY($1::text[])
        OR regexp_replace(COALESCE(c.no_kk,''), '\\D', '', 'g')=ANY($2::text[])
        OR regexp_replace(COALESCE(c.no_ktp_pasangan,''), '\\D', '', 'g')=ANY($1::text[])
        OR regexp_replace(COALESCE(c.no_id_penjamin,''), '\\D', '', 'g')=ANY($1::text[])
        OR regexp_replace(COALESCE(g.no_kk,''), '\\D', '', 'g')=ANY($2::text[])
        OR ${normalizedPhone("c.no_hp")}=ANY($5::text[])
        OR ${normalizedPhone("c.no_hp_pasangan")}=ANY($5::text[])
        OR ${normalizedPhone("g.no_hp")}=ANY($5::text[]))`, params),
  ]);
  const convert = (rows: Record<string, unknown>[], source: ApprovalCandidate["source"]): ApprovalCandidate[] => rows.map((r) => ({ source, reference: String(r.reference), date: String(r.date), submittedAt: String(r.submitted_at || ""), status: String(r.status || ""), nik: String(r.nik || ""), kk: String(r.kk || ""), phone: String(r.phone || ""), contacts: [
    { role: "Pasangan", nik: String(r.partner_nik || ""), phone: String(r.partner_phone || "") },
    { role: "Pasangan", nik: String(r.sales_partner_nik || ""), phone: String(r.sales_partner_phone || "") },
    { role: "Pemohon", kk: String(r.survey_kk || "") },
    { role: "Penjamin", nik: String(r.guarantor_nik || ""), phone: String(r.guarantor_phone || ""), kk: String(r.guarantor_kk || "") },
  ], cancelled: r.cancelled === true || r.cancelled === "t", financingType: String(r.financing_type || ""), datun: source === "Konvensional" ? r.financing_type === "Dana Tunai" : String(r.financing_type || "").trim().toUpperCase() === "DATUN" || ["22", "42", "44"].includes(String(r.product)) }));
  return { rows: [...convert(konven, "Konvensional"), ...convert(syariah, "Syariah")], links };
}

async function main() {
  const { sql, q, getSetting, setSetting, logActivity } = await import("../src/lib/db");
  // Dry run must not trigger schema migration or persist any statuses.
  const leads = await sql().query(`SELECT *, chat_date::text AS chat_date, updated_at::text AS updated_at
    FROM leads WHERE ($1::int IS NULL OR org_id=$1) ORDER BY org_id,id`, [orgFilter]) as Row[];
  const orgs = [...new Set(leads.map((l) => Number(l.org_id)))];
  let failed = false;
  for (const org of orgs) {
    const key = `lead_approval_sync:${org}`;
    const readStatus = async () => { try { return JSON.parse((await getSetting(key)) || "{}"); } catch { return {}; } };
    const before = dryRun ? {} : await readStatus();
    const requested = before.requestedAt && (!before.finishedAt || before.requestedAt > before.finishedAt);
    const mine = leads.filter((l) => Number(l.org_id) === org).filter((l) => {
      if (!polling || requested) return true;
      const checked = Date.parse(String(l.db_approval_checked_at || ""));
      const active = Date.parse(String(l.chat_date)) + 30 * 86400000 >= Date.now();
      return !Number.isFinite(checked) || Date.parse(String(l.updated_at)) > checked || Date.now() - checked > (active ? 30 * 60000 : 24 * 3600000);
    });
    if (!mine.length) continue;
    const startedAt = new Date().toISOString();
    if (!dryRun) {
      const lock = await q(`INSERT INTO app_meta(key,value) VALUES ($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value
        WHERE NOT (COALESCE((app_meta.value::jsonb->>'running')::boolean,false)
          AND (app_meta.value::jsonb->>'startedAt')::timestamptz > now()-interval '20 minutes') RETURNING key`,
      [key, JSON.stringify({ ...before, running: true, startedAt })]);
      if (!lock.length) continue;
    }
    try {
      const results: { lead: Row; result: ReturnType<typeof leadApproval> }[] = [];
      // Complete both source reads before writing: an unavailable source never becomes a negative match.
      for (let start = 0; start < mine.length; start += 150) {
        const batch = mine.slice(start, start + 150);
        const found = await candidates(batch);
        for (const lead of batch) results.push({ lead, result: leadApproval(lead, found.rows, found.links.get(fallbackApprovalPhone(lead))) });
      }
      const totals: Record<string, number> = {};
      let updated = 0;
      for (const { result } of results) {
        totals[result.status] = (totals[result.status] || 0) + 1;
      }
      if (!dryRun) {
        for (let start = 0; start < results.length; start += 150) {
          const payload = results.slice(start, start + 150).map(({ lead, result }) => ({ id: lead.id, chat_date: lead.chat_date, nik: lead.nik ?? null, nik_penjamin: lead.nik_penjamin ?? null, kk: lead.kk ?? null, phone: lead.phone ?? null, ...result }));
          const changed = await q(`UPDATE leads l SET db_approval_status=x.status, db_approval_source=x.source,
            db_approval_ref=x.reference, db_approval_date=x.date::date, db_approval_detail=x.detail, db_approval_checked_at=$3
            FROM jsonb_to_recordset($2::jsonb) AS x(id int, chat_date text, nik text, nik_penjamin text, kk text, phone text, status text, source text, reference text, date text, detail text)
            WHERE l.org_id=$1 AND l.id=x.id AND l.chat_date IS NOT DISTINCT FROM x.chat_date::date
            AND l.nik IS NOT DISTINCT FROM x.nik AND l.nik_penjamin IS NOT DISTINCT FROM x.nik_penjamin AND l.kk IS NOT DISTINCT FROM x.kk AND l.phone IS NOT DISTINCT FROM x.phone RETURNING l.id`, [org, JSON.stringify(payload), startedAt]);
          updated += changed.length;
        }
      }
      const note = `Diperiksa ${mine.length} lead. ${Object.entries(totals).map(([k, v]) => `${k}: ${v}`).join("; ")}`;
      if (!dryRun) {
        await setSetting(key, JSON.stringify({ ...(await readStatus()), running: false, ok: true, finishedAt: new Date().toISOString(), total: updated, note }));
        await logActivity(org, "Pemeriksaan Datun", "Cek status Datun WA Leads", note);
      }
      console.log(JSON.stringify({ org, dryRun, checked: mine.length, updated, statuses: totals }));
    } catch (e) {
      failed = true;
      const note = (e as Error).message;
      if (!dryRun) await setSetting(key, JSON.stringify({ ...(await readStatus()), running: false, ok: false, finishedAt: new Date().toISOString(), note: `Gagal cek; status lama dipertahankan. ${note}` }));
      console.error(JSON.stringify({ org, ok: false, note }));
    }
  }
  if (failed) process.exitCode = 1;
}
main().catch(() => { console.error("Pemeriksaan status gagal. Periksa koneksi database aplikasi."); process.exitCode = 1; }).finally(closeSourceTunnels);
