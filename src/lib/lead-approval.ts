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
export const leadApprovalNiks = (lead: Row) => [...new Set([identity16(lead.nik), identity16(lead.nik_penjamin)].filter(Boolean))];
export const fallbackApprovalPhone = (lead: Row) => !leadApprovalNiks(lead).length && !identity16(lead.kk) ? approvalPhone(lead.phone) : "";
export type ApprovalContact = { role: "Pemohon" | "Pasangan" | "Penjamin"; nik?: string; kk?: string; phone?: string };
export type ApprovalCandidate = {
  source: "Konvensional" | "Syariah"; reference: string; date: string; status: string;
  nik: string; kk: string; phone?: string; contacts?: ApprovalContact[]; datun: boolean; cancelled?: boolean;
};
export function approvalMatchReason(lead: Row, candidate: ApprovalCandidate): string | null {
  const contacts: ApprovalContact[] = [{ role: "Pemohon", nik: candidate.nik, kk: candidate.kk, phone: candidate.phone }, ...(candidate.contacts || [])];
  for (const contact of contacts) {
    const nik = identity16(contact.nik);
    if (nik && leadApprovalNiks(lead).includes(nik)) return `${nik === identity16(lead.nik) ? "NIK" : "NIK pasangan/penjamin lead"} → ${contact.role}`;
  }
  const kk = identity16(lead.kk);
  for (const contact of contacts) if (kk && identity16(contact.kk) === kk) return `KK → ${contact.role}`;
  const phone = fallbackApprovalPhone(lead);
  for (const contact of contacts) if (phone && approvalPhone(contact.phone) === phone) return `Telepon (cadangan) → ${contact.role}`;
  return null;
}
export function leadApproval(lead: Row, candidates: ApprovalCandidate[]) {
  const niks = leadApprovalNiks(lead), kk = identity16(lead.kk);
  const phone = fallbackApprovalPhone(lead);
  const input = String(lead.chat_date || "").slice(0, 10);
  if ((!niks.length && !kk && !phone) || !/^\d{4}-\d{2}-\d{2}$/.test(input) || !Number.isFinite(Date.parse(input))) return { status: "Data belum lengkap", source: null, reference: null, date: null, detail: "Isi Tanggal Chat dan NIK/KK yang valid (16 digit), atau nomor telepon seluler jika NIK dan KK belum tersedia." };
  const matches = candidates.filter((c) => {
    const days = diffDays(input, c.date);
    return c.datun && days > 0 && days <= 30 && !!approvalMatchReason(lead, c);
  }).sort((a, b) => b.date.localeCompare(a.date) || a.reference.localeCompare(b.reference));
  const approved = matches.filter((c) => !c.cancelled && ["approve", "approved"].includes(c.status.trim().toLowerCase()));
  const result = approved[0] || matches[0];
  if (!result) return { status: "Tidak ditemukan", source: null, reference: null, date: null, detail: `Tidak ditemukan pengajuan Datun dengan ${phone ? "nomor telepon" : "NIK/KK"} yang sama pada hari ke-1 sampai ke-30 setelah Tanggal Chat.` };
  return {
    status: approved.length ? "Approve" : result.cancelled ? "Batal" : result.status.trim() || "Status belum diisi", source: result.source, reference: result.reference, date: result.date,
    detail: [...new Set(matches.map((c) => `${c.source} · ${c.reference} · pengajuan ${c.date} · status ${c.status}${c.cancelled ? " (batal)" : ""} · cocok lewat ${approvalMatchReason(lead, c)}`))].join("\n"),
  };
}
