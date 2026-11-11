import assert from "node:assert/strict";
import { identity16, approvalPhone, leadApproval, type ApprovalCandidate } from "../src/lib/lead-approval";
import { cleanInput } from "../src/lib/repo";
import { RESOURCE_MAP } from "../src/lib/resources";
const lead = { chat_date: "2026-11-01", nik: "1234567890123456", kk: "2234567890123456" };
const base: ApprovalCandidate = { source: "Konvensional", reference: "A1", date: "2026-11-02", status: "APPROVED", nik: lead.nik, kk: "", datun: true };
assert.equal(leadApproval(lead, [base]).status, "Approve");
for (const date of ["2026-10-31", "2026-12-02"]) assert.equal(leadApproval(lead, [{ ...base, date }]).status, "Tidak ditemukan", "Older and day 31 applications must not count");
assert.equal(leadApproval(lead, [{ ...base, date: "2026-11-01" }]).status, "Approve", "Same-day applications are included");
assert.equal(leadApproval(lead, [{ ...base, date: "2026-12-01" }]).status, "Approve", "Day 30 is included");
assert.equal(leadApproval(lead, [{ ...base, datun: false }]).status, "Tidak ditemukan");
assert.equal(leadApproval(lead, [{ ...base, nik: "9999999999999999" }]).status, "Tidak ditemukan");
assert.equal(leadApproval(lead, [{ ...base, source: "Syariah", nik: "", kk: lead.kk, status: "Approve" }]).source, "Syariah", "KK alone can match across sources");
assert.equal(leadApproval(lead, [{ ...base, status: "PENDING" }]).status, "PENDING");
assert.equal(leadApproval(lead, [{ ...base, cancelled: true }]).status, "Batal");
assert.equal(leadApproval(lead, [{ ...base, status: "CANCELLED", date: "2026-11-04" }, { ...base, source: "Syariah", status: "Approve" }]).status, "Approve", "An approved match wins over another cancelled application");
assert.equal(leadApproval({ chat_date: lead.chat_date, nik: "123" }, [base]).status, "Data belum lengkap");
assert.equal(identity16("'1234 5678 9012 3456"), lead.nik);
assert.equal(identity16("0000000000000000"), "");
assert.deepEqual(cleanInput(RESOURCE_MAP.leads, { db_approval_status: "Approve", db_approval_ref: "fake" }), {}, "Clients cannot forge source status");
assert.equal(cleanInput(RESOURCE_MAP.leads, { nik: lead.nik, db_approval_status: "Approve" }).db_approval_status, null, "Identity edits invalidate cached status");
assert.equal(cleanInput(RESOURCE_MAP.leads, { chat_date: "2026-11-02" }).db_approval_checked_at, null);
const phoneLead = { chat_date: lead.chat_date, nik: null, kk: null, phone: "081234567890" };
for (const phone of ["081234567890", "+62 812-3456-7890", "6281234567890", "81234567890", "006281234567890"]) {
  assert.equal(approvalPhone(phone), phoneLead.phone);
  const matched = leadApproval(phoneLead, [{ ...base, phone, nik: "", kk: "" }]);
  assert.equal(matched.status, "Approve");
  assert.match(matched.detail, /Telepon \(cadangan\)/);
}
assert.equal(leadApproval({ ...phoneLead, nik: lead.nik }, [{ ...base, nik: "9999999999999999", phone: phoneLead.phone }]).status, "Tidak ditemukan", "A valid NIK prevents phone fallback from overriding a different identity");
assert.equal(leadApproval({ ...phoneLead, kk: lead.kk }, [{ ...base, nik: "", kk: "9999999999999999", phone: phoneLead.phone }]).status, "Tidak ditemukan", "A valid KK must also take precedence over phone");
assert.equal(leadApproval(phoneLead, [{ ...base, nik: "", phone: "081234567891" }]).status, "Tidak ditemukan", "Phones must match in full");
for (const date of ["2026-10-31", "2026-12-02"]) assert.equal(leadApproval(phoneLead, [{ ...base, nik: "", phone: phoneLead.phone, date }]).status, "Tidak ditemukan");
assert.equal(leadApproval(phoneLead, [{ ...base, nik: "", phone: phoneLead.phone, date: "2026-12-01" }]).status, "Approve");
assert.equal(leadApproval(phoneLead, [{ ...base, nik: "", phone: phoneLead.phone, datun: false }]).status, "Tidak ditemukan");
assert.equal(leadApproval(phoneLead, [{ ...base, source: "Syariah", nik: "", phone: phoneLead.phone, status: "Approve", cancelled: true }]).status, "Batal");
for (const phone of ["", "0812", "0000000000", "1234567890"]) assert.equal(approvalPhone(phone), "");
assert.equal(cleanInput(RESOURCE_MAP.leads, { phone: "081234567891" }).db_approval_status, null, "Phone edits invalidate the old result");
for (const role of ["Pasangan", "Penjamin"] as const) {
  const contact = { ...base, nik: "", contacts: [{ role, nik: lead.nik, phone: phoneLead.phone }] };
  assert.equal(leadApproval(lead, [contact]).status, "Approve");
  assert.match(leadApproval(lead, [contact]).detail, new RegExp(role));
  assert.equal(leadApproval(phoneLead, [contact]).status, "Approve");
  assert.match(leadApproval(phoneLead, [contact]).detail, new RegExp(`Telepon.*${role}`));
  assert.equal(leadApproval(lead, [{ ...contact, date: "2026-10-31" }]).status, "Tidak ditemukan");
  assert.equal(leadApproval(lead, [{ ...contact, datun: false }]).status, "Tidak ditemukan");
}
const guarantorLead = { chat_date: lead.chat_date, nik_penjamin: lead.nik };
assert.equal(leadApproval(guarantorLead, [base]).status, "Approve", "A lead guarantor NIK can match a source applicant");
assert.match(leadApproval(guarantorLead, [base]).detail, /NIK pasangan\/penjamin lead → Pemohon/);
assert.equal(leadApproval({ ...phoneLead, nik_penjamin: lead.nik }, [{ ...base, nik: "9999999999999999", phone: phoneLead.phone }]).status, "Tidak ditemukan", "Guarantor identity also takes precedence over phone fallback");
assert.equal(cleanInput(RESOURCE_MAP.leads, { nik_penjamin: lead.nik }).db_approval_status, null);
for (const status of ["ASSIGNED", "SURVEYED", "REJECTED", "CANCELLED", "Need Approval", "Batal"]) assert.equal(leadApproval(lead, [{ ...base, status }]).status, status, "Unapproved applications show their actual source status");
assert.equal(leadApproval(lead, [{ ...base, status: "PENDING", date: "2026-11-02" }, { ...base, status: "SURVEYED", date: "2026-11-03", reference: "A2" }]).status, "SURVEYED", "Show the latest application status when none is approved");
const history: ApprovalCandidate[] = [
  { ...base, reference: "assigned", status: "ASSIGNED", date: "2026-11-03" },
  { ...base, reference: "approved", status: "APPROVED", date: "2026-11-04" },
  { ...base, reference: "pending", status: "PENDING", date: "2026-11-05" },
];
for (const list of [history, [...history].reverse(), [history[2], history[0], history[1]]]) {
  const picked = leadApproval(lead, list);
  assert.equal(picked.status, "Approve", "Approve always outranks more recent pending applications");
  assert.equal(picked.reference, "approved");
}
const newerApproved: ApprovalCandidate = { ...base, source: "Syariah", reference: "new-approved", status: "Approve", date: "2026-11-06" };
assert.equal(leadApproval(lead, [...history, newerApproved]).reference, "new-approved", "Pick the newest approval across both databases");
assert.equal(leadApproval(lead, [history[0], history[2]]).reference, "pending", "Without any approval pick the newest application");
assert.equal(leadApproval(lead, [history[2], { ...newerApproved, date: "2026-12-02" }]).status, "PENDING", "An approval outside the 30-day window cannot win");
assert.equal(leadApproval(lead, [history[2], { ...newerApproved, cancelled: true }]).status, "Batal", "Cancelled approval must not be presented as Approve");
const sameDay = [
  { ...base, reference: "20", status: "ASSIGNED", submittedAt: "2026-11-02T09:00:00.000000" },
  { ...base, reference: "10", status: "PENDING", submittedAt: "2026-11-02T15:00:00.000000" },
];
assert.equal(leadApproval(lead, sameDay).reference, "10", "Submission time decides the latest application on the same day");
assert.equal(leadApproval(lead, sameDay.map((c) => ({ ...c, status: "APPROVED" }))).reference, "10", "Submission time also decides the newest approval");
const linkedIdentity = "3234567890123456";
const changedPhoneApproval: ApprovalCandidate = { ...base, source: "Syariah", reference: "linked-approved", nik: linkedIdentity, phone: "089999999999", status: "Approve" };
const link = { niks: [linkedIdentity], kks: [] };
assert.equal(leadApproval(phoneLead, [changedPhoneApproval]).status, "Tidak ditemukan");
assert.equal(leadApproval(phoneLead, [changedPhoneApproval], link).status, "Approve", "Resolve the phone to a source identity, then find its approval across databases even with a different phone");
assert.match(leadApproval(phoneLead, [changedPhoneApproval], link).detail, /Telepon → NIK sumber → Pemohon/);
assert.equal(leadApproval({ ...phoneLead, nik: lead.nik }, [changedPhoneApproval], link).status, "Tidak ditemukan", "Source identity links cannot override an explicit lead identity");
assert.equal(leadApproval(phoneLead, [changedPhoneApproval], { niks: ["4234567890123456"], kks: [] }).status, "Tidak ditemukan", "Identity links must remain isolated per phone, not pooled across leads");
assert.equal(leadApproval(phoneLead, [{ ...changedPhoneApproval, date: "2026-12-02" }], link).status, "Tidak ditemukan");
assert.equal(leadApproval(phoneLead, [{ ...changedPhoneApproval, datun: false }], link).status, "Tidak ditemukan");
assert.equal(leadApproval(phoneLead, [{ ...base, nik: "", phone: phoneLead.phone, status: "PENDING", date: "2026-11-01" }, changedPhoneApproval], link).reference, "linked-approved");
assert.equal(leadApproval(phoneLead, [{ ...changedPhoneApproval, nik: "", kk: lead.kk }], { niks: [], kks: [lead.kk] }).status, "Approve", "A source KK obtained through the phone can also locate financing");
console.log("Contact matching, identity links, inclusive dates and approval priority checks passed");
