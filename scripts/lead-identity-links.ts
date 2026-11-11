import { sourceQuery } from "./source-db";
import { approvalPhone, identity16, type ApprovalIdentityLink } from "../src/lib/lead-approval";

export const normalizedSourcePhone = (column: string) => {
  const d = `regexp_replace(COALESCE(${column},''), '\\D', '', 'g')`;
  return `(CASE WHEN ${d} LIKE '0062%' THEN '0'||substring(${d} FROM 5) WHEN ${d} LIKE '62%' THEN '0'||substring(${d} FROM 3) WHEN ${d} LIKE '8%' THEN '0'||${d} ELSE ${d} END)`;
};

/** Historical source contacts establish identities only; applications still use the strict Datun/date filters. */
export async function findLeadIdentityLinks(phones: string[]): Promise<Map<string, ApprovalIdentityLink>> {
  const links = new Map<string, ApprovalIdentityLink>(phones.map((phone) => [phone, { niks: [], kks: [] }]));
  if (!phones.length) return links;
  const p = normalizedSourcePhone;
  const [konven, syariah] = await Promise.all([
    sourceQuery("konvensional", `
      SELECT u.phone_number AS phone,u.ktp_number AS nik,NULL::text AS kk FROM "Users" u WHERE ${p("u.phone_number")}=ANY($1::text[])
      UNION ALL
      SELECT u.phone_number AS phone,u.ktp_number AS nik,a.kk_number AS kk FROM "Applications" a JOIN "Users" u ON u.id=a.user_id WHERE ${p("u.phone_number")}=ANY($1::text[])
      UNION ALL
      SELECT a.partner_phone AS phone,a.partner_ktp_number AS nik,a.kk_number AS kk FROM "Applications" a WHERE ${p("a.partner_phone")}=ANY($1::text[])`, [phones]),
    sourceQuery("syariah", `
      SELECT c.no_hp AS phone,c.no_id AS nik,c.no_kk AS kk FROM public.tblcustomer c WHERE ${p("c.no_hp")}=ANY($1::text[])
      UNION ALL
      SELECT c.no_hp_pasangan AS phone,c.no_ktp_pasangan AS nik,c.no_kk AS kk FROM public.tblcustomer c WHERE ${p("c.no_hp_pasangan")}=ANY($1::text[])`, [phones]),
  ]);
  for (const r of [...konven, ...syariah]) {
    const link = links.get(approvalPhone(r.phone));
    if (!link) continue;
    const nik = identity16(r.nik), kk = identity16(r.kk);
    if (nik && !link.niks.includes(nik)) link.niks.push(nik);
    if (kk && !link.kks.includes(kk)) link.kks.push(kk);
  }
  return links;
}
