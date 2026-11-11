import { n, type Row } from "./resources";
import { diffDays, monthEnd } from "./format";

export type KpiUnit = "number" | "percent" | "money" | "rating";
export const KPI_SOURCES: Record<string, { label: string; unit: KpiUnit; family: "content" | "leads" | "manual"; cumulative: boolean; description: string }> = {
  uploaded: { label: "Konten diunggah", unit: "number", family: "content", cumulative: true, description: "Satu konten dihitung sekali pada bulan unggahan file pertama." },
  posted: { label: "Konten tayang", unit: "number", family: "content", cumulative: true, description: "Status Posted; bulan mengikuti tanggal aktual, atau tanggal posting jika aktual kosong." },
  approved: { label: "Konten disetujui", unit: "number", family: "content", cumulative: true, description: "Konten berstatus Disetujui yang dijadwalkan pada bulan KPI." },
  approval_rate: { label: "Persentase konten disetujui", unit: "percent", family: "content", cumulative: false, description: "Konten Disetujui ÷ semua rencana konten pada bulan KPI × 100%. Cancel dikecualikan." },
  on_time: { label: "Persentase tayang tepat waktu", unit: "percent", family: "content", cumulative: false, description: "Konten Posted dengan tanggal aktual ≤ jadwal ÷ semua konten yang sudah jatuh jadwal pada bulan KPI × 100%. Tanggal aktual harus diisi." },
  er: { label: "Engagement rate konten", unit: "percent", family: "content", cumulative: false, description: "Rata-rata (like + comment + saved) ÷ followers × 100% dari konten Posted yang memiliki followers." },
  leads: { label: "Jumlah leads", unit: "number", family: "leads", cumulative: true, description: "Leads berdasarkan bulan tanggal chat, brand, cabang, dan PIC." },
  deals: { label: "Jumlah deal", unit: "number", family: "leads", cumulative: true, description: "Leads berstatus Deal atau tahap Akad, berdasarkan bulan tanggal chat." },
  revenue: { label: "Nilai deal / pencairan", unit: "money", family: "leads", cumulative: true, description: "Total nilai deal dari leads Deal atau Akad, berdasarkan bulan tanggal chat." },
  conversion: { label: "Konversi leads menjadi deal", unit: "percent", family: "leads", cumulative: false, description: "Jumlah leads Deal atau Akad ÷ seluruh leads pada bulan tanggal chat × 100%." },
  manual: { label: "Indikator khusus / isi manual", unit: "number", family: "manual", cumulative: false, description: "Isi hasil sendiri. Persentase dapat dihitung dari jumlah berhasil ÷ jumlah keseluruhan." },
};
export const LEGACY_KPI_FIELDS: Record<string, { label: string; unit: KpiUnit; source: string; lower?: boolean }> = {
  target_posts: { label: "Konten tayang", unit: "number", source: "posted" },
  target_uploads: { label: "Konten diunggah", unit: "number", source: "uploaded" },
  target_er: { label: "Engagement rate", unit: "percent", source: "er" },
  target_leads: { label: "Leads", unit: "number", source: "leads" },
  target_deals: { label: "Deal", unit: "number", source: "deals" },
  target_revenue: { label: "Omzet", unit: "money", source: "revenue" },
  ads_budget: { label: "Batas budget iklan", unit: "money", source: "spend", lower: true },
  max_cpl: { label: "Maksimal biaya per lead", unit: "money", source: "cpl", lower: true },
  target_rating: { label: "Rating Google", unit: "rating", source: "rating" },
};
export function validateKpi(row: Row): string | null {
  if (!row.metric_source) return null;
  const spec = KPI_SOURCES[String(row.metric_source)];
  if (!spec) return "Indikator KPI tidak dikenal";
  if (!row.title) return "Judul KPI wajib diisi";
  if (row.target_value === null || row.target_value === undefined || row.target_value === "" || !Number.isFinite(Number(row.target_value))) return "Nilai target wajib berupa angka";
  if (!["number", "percent", "money", "rating"].includes(String(row.metric_unit))) return "Satuan KPI tidak valid";
  if (spec.family !== "manual" && row.metric_unit !== spec.unit) return "Satuan harus sesuai indikator otomatis";
  if (!["higher", "lower"].includes(String(row.direction))) return "Pilih arah target";
  if (row.metric_source === "manual" && row.manual_mode && !["value", "ratio"].includes(String(row.manual_mode))) return "Cara isi aktual tidak valid";
  if (n(row.target_value) < 0 || (row.direction === "higher" && n(row.target_value) === 0)) return "Target minimal harus lebih dari nol";
  if (row.metric_unit === "rating" && n(row.target_value) > 5) return "Target rating maksimal 5";
  if (row.metric_unit === "percent" && row.metric_source !== "er" && n(row.target_value) > 100) return "Target persentase maksimal 100%";
  if (row.weight !== null && row.weight !== undefined && row.weight !== "" && (!Number.isFinite(Number(row.weight)) || n(row.weight) <= 0)) return "Bobot harus lebih dari nol";
  if (spec.family === "leads" && (row.content_category || row.content_type)) return "Kategori dan jenis konten hanya berlaku untuk indikator konten";
  if (row.manual_mode === "ratio" && (row.metric_source !== "manual" || row.metric_unit !== "percent")) return "Perhitungan rasio hanya untuk indikator manual persen";
  if (row.manual_mode === "ratio" && n(row.actual_numerator) > n(row.actual_denominator)) return "Jumlah berhasil tidak boleh melebihi jumlah keseluruhan";
  if (row.actual_value !== null && row.actual_value !== undefined && row.actual_value !== "" && row.metric_source === "manual" && ((row.metric_unit === "percent" && n(row.actual_value) > 100) || (row.metric_unit === "rating" && n(row.actual_value) > 5))) return "Aktual melebihi batas satuan";
  return null;
}

export type KpiData = { content: Row[]; leads: Row[]; ads: Row[]; reviews: Row[] };
const monthOf = (d: unknown) => String(d || "").slice(0, 7);
const deal = (r: Row) => r.final_status === "Deal" || r.initial_status === "Deal" || /akad/i.test(String(r.pipeline_stage || ""));
const sum = (rs: Row[], key: string) => rs.reduce((s, r) => s + n(r[key]), 0);
const average = (xs: number[]) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
const ratio = (a: number, b: number) => b ? a / b * 100 : null;
export type KpiEvidence = { id: number; title: string; date: string; status: string; resource: string };
export type KpiMetric = { key: string; label: string; unit: KpiUnit; target: number; actual: number | null; lower: boolean; cumulative: boolean; basis: string; numerator?: number; denominator?: number; evidence: KpiEvidence[] };

export function calculateKpi(row: Row, data: KpiData, today: string) {
  const month = monthOf(row.period);
  const scoped = (rs: Row[], content = false) => rs.filter((r) => ["brand", "branch", "pic", ...(content ? ["content_category", "content_type"] : [])].every((k) => !row[k] || row[k] === r[k]));
  const contents = scoped(data.content, true).filter((c) => c.status !== "Cancel");
  const planned = contents.filter((c) => monthOf(c.post_date) === month);
  const posted = contents.filter((c) => c.status === "Posted" && monthOf(c.actual_date || c.post_date) === month);
  const uploaded = contents.filter((c) => monthOf(c.upload_date) === month);
  const approved = planned.filter((c) => c.approval_status === "Disetujui");
  const due = planned.filter((c) => String(c.post_date).slice(0, 10) <= today);
  const onTime = due.filter((c) => c.status === "Posted" && c.actual_date && String(c.actual_date).slice(0, 10) <= String(c.post_date).slice(0, 10));
  const leads = scoped(data.leads).filter((r) => monthOf(r.chat_date) === month);
  const deals = leads.filter(deal);
  const ads = data.ads.filter((r) => (!row.brand || r.brand === row.brand) && monthOf(r.start_date) === month);
  const reviews = data.reviews.filter((r) => (!row.brand || r.brand === row.brand) && (!row.branch || r.branch === row.branch) && monthOf(r.review_date) === month);
  const evidence = (rs: Row[], resource: string, dateKey: string): KpiEvidence[] => rs.map((r) => ({ id: Number(r.id), title: String(r.title || r.name || r.reviewer || r.campaign_name || r.brand || `#${r.id}`), date: String(r[dateKey] || (dateKey === "actual_date" ? r.post_date : "") || "").slice(0, 10), status: [r.status, r.approval_status, r.final_status].filter(Boolean).join(" · "), resource }));
  const read = (source: string): Pick<KpiMetric, "actual" | "basis" | "evidence" | "numerator" | "denominator"> => {
    switch (source) {
      case "uploaded": return { actual: uploaded.length, basis: KPI_SOURCES.uploaded.description, evidence: evidence(uploaded, "content", "upload_date") };
      case "posted": return { actual: posted.length, basis: KPI_SOURCES.posted.description, evidence: evidence(posted, "content", "actual_date") };
      case "approved": return { actual: approved.length, basis: KPI_SOURCES.approved.description, evidence: evidence(approved, "content", "post_date") };
      case "approval_rate": return { actual: ratio(approved.length, planned.length), numerator: approved.length, denominator: planned.length, basis: KPI_SOURCES.approval_rate.description, evidence: evidence(planned, "content", "post_date") };
      case "on_time": return { actual: ratio(onTime.length, due.length), numerator: onTime.length, denominator: due.length, basis: KPI_SOURCES.on_time.description, evidence: evidence(due, "content", "post_date") };
      case "er": { const sample = posted.filter((r) => n(r.followers) > 0); return { actual: average(sample.map((r) => (n(r.likes) + n(r.comments) + n(r.saves)) / n(r.followers) * 100)), basis: KPI_SOURCES.er.description, evidence: evidence(sample, "content", "actual_date") }; }
      case "leads": return { actual: leads.length, basis: KPI_SOURCES.leads.description, evidence: evidence(leads, "leads", "chat_date") };
      case "deals": return { actual: deals.length, basis: KPI_SOURCES.deals.description, evidence: evidence(deals, "leads", "chat_date") };
      case "revenue": return { actual: sum(deals, "deal_value"), basis: KPI_SOURCES.revenue.description, evidence: evidence(deals, "leads", "chat_date") };
      case "conversion": return { actual: ratio(deals.length, leads.length), numerator: deals.length, denominator: leads.length, basis: KPI_SOURCES.conversion.description, evidence: evidence(leads, "leads", "chat_date") };
      case "spend": return { actual: !row.branch && !row.pic && ads.length ? sum(ads, "spend") : null, basis: row.branch || row.pic ? "Belanja iklan belum terhubung ke cabang/PIC. Gunakan indikator manual untuk target dengan cakupan tersebut." : "Total belanja campaign berdasarkan bulan tanggal mulai.", evidence: !row.branch && !row.pic ? evidence(ads, "ads", "start_date") : [] };
      case "cpl": return { actual: !row.branch && !row.pic && leads.length && ads.length ? sum(ads, "spend") / leads.length : null, basis: row.branch || row.pic ? "Belanja iklan belum terhubung ke cabang/PIC. Gunakan indikator manual untuk target dengan cakupan tersebut." : "Belanja campaign mulai bulan ini ÷ jumlah leads bulan ini.", evidence: !row.branch && !row.pic ? evidence(leads, "leads", "chat_date") : [] };
      case "rating": return { actual: !row.pic ? average(reviews.map((r) => n(r.rating))) : null, basis: row.pic ? "Ulasan belum terhubung ke PIC. Gunakan indikator manual untuk target per PIC." : "Rata-rata rating ulasan pada bulan KPI.", evidence: !row.pic ? evidence(reviews, "reviews", "review_date") : [] };
      default: {
        const isRatio = row.manual_mode === "ratio";
        const actual = isRatio ? (row.actual_numerator === null || row.actual_numerator === undefined ? null : ratio(n(row.actual_numerator), n(row.actual_denominator))) : row.actual_value === null || row.actual_value === undefined || row.actual_value === "" ? null : n(row.actual_value);
        return { actual, ...(isRatio ? { numerator: n(row.actual_numerator), denominator: n(row.actual_denominator) } : {}), basis: isRatio ? "Jumlah berhasil ÷ jumlah keseluruhan × 100%." : "Hasil diisi manual oleh tim.", evidence: [] };
      }
    }
  };
  const metrics: KpiMetric[] = [];
  if (row.metric_source) {
    const source = String(row.metric_source);
    const spec = KPI_SOURCES[source];
    if (spec) metrics.push({ key: source, label: source === "manual" ? String(row.title || "Indikator khusus") : spec.label, unit: row.metric_unit as KpiUnit, target: n(row.target_value), lower: row.direction === "lower", cumulative: spec.cumulative, ...read(source) });
  } else {
    for (const [key, spec] of Object.entries(LEGACY_KPI_FIELDS)) if (n(row[key]) > 0) metrics.push({ key, label: spec.label, unit: spec.unit, target: n(row[key]) * (key === "target_er" ? 100 : 1), lower: !!spec.lower, cumulative: KPI_SOURCES[spec.source]?.cumulative || false, ...read(spec.source) });
  }
  const days = diffDays(`${month}-01`, monthEnd(`${month}-01`)) + 1;
  const elapsed = Math.max(0, Math.min(days, diffDays(`${month}-01`, today) + 1));
  const daysLeft = month < today.slice(0, 7) ? 0 : month > today.slice(0, 7) ? days : Math.max(0, days - elapsed + 1);
  const assessed = metrics.map((m) => {
    const achieved = m.actual !== null && (m.lower ? m.actual <= m.target : m.actual >= m.target);
    const score = m.actual === null ? null : Math.min(100, Math.max(0, m.lower ? (m.actual === 0 ? 100 : m.target / m.actual * 100) : m.target > 0 ? m.actual / m.target * 100 : 0));
    const expected = m.cumulative && !m.lower ? Math.ceil(m.target * elapsed / days) : null;
    const gap = m.actual === null ? null : Math.max(0, m.lower ? m.actual - m.target : m.target - m.actual);
    const dailyNeeded = m.cumulative && !m.lower && gap !== null && daysLeft > 0 ? Math.ceil(gap / daysLeft) : null;
    return { ...m, achieved, score, expected, gap, dailyNeeded };
  });
  const allDone = assessed.length > 0 && assessed.every((m) => m.achieved);
  const status = allDone ? "achieved" : month > today.slice(0, 7) ? "upcoming" : !assessed.length || assessed.some((m) => m.actual === null) ? "no_data" : month < today.slice(0, 7) ? "overdue" : assessed.some((m) => m.lower ? !m.achieved : m.expected !== null && m.actual! < m.expected) ? "behind" : assessed.some((m) => !m.cumulative && !m.achieved) ? "below_target" : "on_track";
  return { row, month, daysLeft, category: String(row.content_category || row.kpi_category || "Tanpa kategori"), metrics: assessed, status, score: assessed.length && assessed.every((m) => m.score !== null) ? average(assessed.map((m) => m.score!)) : null, weight: n(row.weight) || 1, mandatory: row.mandatory === "Ya" };
}
export type KpiScorecard = ReturnType<typeof calculateKpi>;

export function weightedKpiScore(cards: KpiScorecard[]) {
  const measured = cards.filter((c) => c.score !== null);
  const weight = measured.reduce((s, c) => s + c.weight, 0);
  return { score: weight ? measured.reduce((s, c) => s + c.score! * c.weight, 0) / weight : null, measured: measured.length, total: cards.length, mandatoryPending: cards.filter((c) => c.mandatory && c.status !== "achieved").length };
}
