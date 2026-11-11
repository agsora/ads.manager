import { diffDays } from "./format";
import type { Row } from "./resources";
import { normPhone } from "./phone";

export const identity16 = (v: unknown) => {
  const digits = String(v ?? "").replace(/\D/g, "");
  return /^\d{16}$/.test(digits) && !/^0+$/.test(digits) ? digits : "";
};
export const approvalPhone = (v: unknown) => {
  const digits = String(v ?? "").replace(/\D/g, "");
  const phone = normPhone(digits.startsWith("0062") ? digits.slice(2) : digits);
  return /^08\d{8,11}$/.test(phone) ? phone : "";
};
export const fallbackApprovalPhone = (lead: Row) => !identity16(lead.nik) && !identity16(lead.kk) ? approvalPhone(lead.phone) : "";
export type ApprovalCandidate = {
  source: "Konvensional" | "Syariah"; reference: string; date: string; status: string;
  nik: string; kk: string; phone?: string; datun: boolean; cancelled?: boolean;
};
export function leadApproval(lead: Row, candidates: ApprovalCandidate[]) {
  const nik = identity16(lead.nik), kk = identity16(lead.kk);
  const phone = fallbackApprovalPhone(lead);
  const input = String(lead.chat_date || "").slice(0, 10);
  if ((!nik && !kk && !phone) || !/^\d{4}-\d{2}-\d{2}$/.test(input) || !Number.isFinite(Date.parse(input))) return { status: "Data belum lengkap", source: null, reference: null, date: null, detail: "Isi Tanggal Chat dan NIK/KK yang valid (16 digit), atau nomor telepon seluler jika NIK dan KK belum tersedia." };
  const matches = candidates.filter((c) => {
    const days = diffDays(input, c.date);
    return c.datun && days > 0 && days <= 30 && ((nik && identity16(c.nik) === nik) || (kk && identity16(c.kk) === kk) || (phone && approvalPhone(c.phone) === phone));
  }).sort((a, b) => b.date.localeCompare(a.date) || a.reference.localeCompare(b.reference));
  const approved = matches.filter((c) => !c.cancelled && ["approve", "approved"].includes(c.status.trim().toLowerCase()));
  const result = approved[0] || matches[0];
  if (!result) return { status: "Tidak ditemukan", source: null, reference: null, date: null, detail: `Tidak ditemukan pengajuan Datun dengan ${phone ? "nomor telepon" : "NIK/KK"} yang sama pada hari ke-1 sampai ke-30 setelah Tanggal Chat.` };
  return {
    status: approved.length ? "Approve" : "Belum approve", source: result.source, reference: result.reference, date: result.date,
    detail: matches.map((c) => `${c.source} · ${c.reference} · pengajuan ${c.date} · status ${c.status}${c.cancelled ? " (batal)" : ""} · cocok lewat ${phone ? "Telepon (cadangan)" : nik && identity16(c.nik) === nik ? "NIK" : "KK"}`).join("\n"),
  };
}
