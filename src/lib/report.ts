import ExcelJS from "exceljs";
import { buildAnalytics } from "./analytics";
import { addTableSheet } from "./excel";
import { todayISO } from "./format";

const LEVEL: Record<string, string> = { critical: "KRITIS", warning: "PERLU PERHATIAN", info: "SARAN", good: "BAGUS" };
const RP = '"Rp"#,##0';

/** Full multi-sheet marketing report for a period (used by download and the weekly email). */
export async function buildReportWorkbook(orgId: number, from: string, to: string, brand?: string | null) {
  const t = todayISO();
  const a = await buildAnalytics(orgId, { from, to, brand });
  const k = a.kpis;
  const p = a.prevKpis;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Ads Manager";

  const sum = wb.addWorksheet("Ringkasan");
  sum.columns = [{ width: 16 }, { width: 42 }, { width: 22 }, { width: 22 }];
  sum.addRow(["Laporan Digital Marketing"]).font = { bold: true, size: 14 };
  sum.addRow([`Periode ${from} s/d ${to} (pembanding ${a.period.prevFrom} s/d ${a.period.prevTo})${brand ? ` · Brand: ${brand}` : " · Semua brand"} · dibuat ${t}`]);
  sum.addRow([]);
  const head = sum.addRow(["Area", "Metrik", "Periode Ini", "Periode Lalu"]);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
  const rows: [string, string, unknown, unknown, string?][] = [
    ["Ads", "Budget terpakai", k.ads.spend, p.ads.spend, RP],
    ["Ads", "Impresi", k.ads.impressions, p.ads.impressions, "#,##0"],
    ["Ads", "Jangkauan", k.ads.reach, p.ads.reach, "#,##0"],
    ["Ads", "Klik tautan", k.ads.clicks, p.ads.clicks, "#,##0"],
    ["Ads", "CTR", k.ads.ctr, p.ads.ctr, "0.00%"],
    ["Ads", "CPC", k.ads.cpc, p.ads.cpc, RP],
    ["Ads", "Percakapan dimulai", k.ads.conversations, p.ads.conversations, "#,##0"],
    ["Ads", "Biaya per percakapan", k.ads.costPerConv, p.ads.costPerConv, RP],
    ["Ads", "Omzet dari ads", k.ads.revenue, p.ads.revenue, RP],
    ["Ads", "ROAS", k.ads.roas, p.ads.roas, "0.00"],
    ["Leads", "Total leads", k.leads.leads, p.leads.leads, "#,##0"],
    ["Leads", "HOT / WARM / COLD", `${k.leads.hot} / ${k.leads.warm} / ${k.leads.cold}`, `${p.leads.hot} / ${p.leads.warm} / ${p.leads.cold}`],
    ["Leads", "Deal", k.leads.deals, p.leads.deals, "#,##0"],
    ["Leads", "Conversion rate", k.leads.dealRate, p.leads.dealRate, "0.0%"],
    ["Leads", "Ghosting rate", k.leads.ghostRate, p.leads.ghostRate, "0.0%"],
    ["Leads", "Nilai deal", k.leads.dealValue, p.leads.dealValue, RP],
    ["Biaya", "Total biaya marketing (ads+blast+influencer)", a.overall.totalCost, null, RP],
    ["Biaya", "Biaya per lead (CPL)", a.overall.cpl, null, RP],
    ["Biaya", "Biaya per deal (CPA)", a.overall.cpa, null, RP],
    ["WA Blast", "Pesan terkirim", k.blast.sent, p.blast.sent, "#,##0"],
    ["WA Blast", "Read rate", k.blast.readRate, p.blast.readRate, "0.0%"],
    ["WA Blast", "Reply rate", k.blast.replyRate, p.blast.replyRate, "0.0%"],
    ["WA Blast", "Leads dari blast", k.blast.leads, p.blast.leads, "#,##0"],
    ["Konten", "Konten direncanakan", k.content.planned, p.content.planned, "#,##0"],
    ["Konten", "Konten tayang", k.content.posted, p.content.posted, "#,##0"],
    ["Konten", "Completion rate", k.content.completionRate, p.content.completionRate, "0.0%"],
    ["Konten", "Rata-rata ER", k.content.avgER, p.content.avgER, "0.00%"],
    ["Reputasi", "Jumlah ulasan", k.reviews.reviews, p.reviews.reviews, "#,##0"],
    ["Reputasi", "Rata-rata rating", k.reviews.avgRating, p.reviews.avgRating, "0.00"],
    ["Reputasi", "Response rate", k.reviews.responseRate, p.reviews.responseRate, "0.0%"],
    ["Influencer", "Total fee", k.influencer.fee, p.influencer.fee, RP],
    ["Influencer", "ROI", k.influencer.roi, p.influencer.roi, "0.0%"],
    ["Skor", "Health score keseluruhan (0-100)", a.scores.overall, null, "0"],
  ];
  for (const [area, metric, cur, prev, fmt] of rows) {
    const r = sum.addRow([area, metric, cur, prev]);
    if (fmt) {
      r.getCell(3).numFmt = fmt;
      r.getCell(4).numFmt = fmt;
    }
  }

  addTableSheet(wb, "Insight & Rekomendasi", [
    { header: "Prioritas", key: "level", width: 16 },
    { header: "Area", key: "area", width: 12 },
    { header: "Temuan", key: "title", width: 45 },
    { header: "Detail", key: "detail", width: 60 },
    { header: "Yang Harus Dilakukan", key: "action", width: 70 },
  ], a.insights.map((i) => ({ ...i, level: LEVEL[i.level] }))).eachRow((r) => {
    r.alignment = { wrapText: true, vertical: "top" };
  });

  if (a.kpiProgress.length)
    addTableSheet(wb, "Target KPI", [
      { header: "Metrik", key: "metric", width: 26 },
      { header: "Target", key: "target", width: 16 },
      { header: "Aktual", key: "actual", width: 16 },
      { header: "Pencapaian", key: "pct", format: "percent", width: 14 },
    ], a.kpiProgress);

  const money = "money";
  addTableSheet(wb, "Ads per Campaign", [
    { header: "Campaign", key: "name", width: 30 }, { header: "Brand", key: "brand" }, { header: "Platform", key: "platform" }, { header: "Status", key: "status" },
    { header: "Spend", key: "spend", format: money }, { header: "Impresi", key: "impressions", format: "number" }, { header: "Jangkauan", key: "reach", format: "number" },
    { header: "Frekuensi", key: "frequency", format: "decimal" }, { header: "Klik", key: "clicks", format: "number" }, { header: "CTR", key: "ctr", format: "percent" },
    { header: "CPC", key: "cpc", format: money }, { header: "Percakapan", key: "conversations", format: "number" }, { header: "Biaya/Percakapan", key: "costPerConv", format: money },
    { header: "Omzet", key: "revenue", format: money }, { header: "ROAS", key: "roas", format: "decimal" },
  ], a.campaigns);
  addTableSheet(wb, "Ads per Platform", [
    { header: "Platform", key: "name" }, { header: "Spend", key: "spend", format: money }, { header: "Impresi", key: "impressions", format: "number" },
    { header: "Klik", key: "clicks", format: "number" }, { header: "CTR", key: "ctr", format: "percent" }, { header: "CPC", key: "cpc", format: money },
    { header: "Percakapan", key: "conversations", format: "number" }, { header: "Biaya/Percakapan", key: "costPerConv", format: money }, { header: "ROAS", key: "roas", format: "decimal" },
  ], a.byPlatform);
  if (a.wallets.length)
    addTableSheet(wb, "Saldo Iklan", [
      { header: "Brand", key: "brand" }, { header: "Platform", key: "platform" }, { header: "Saldo Awal", key: "opening", format: money }, { header: "Top Up", key: "topup", format: money },
      { header: "Dana Tersedia", key: "available", format: money }, { header: "Terpakai", key: "spent", format: money }, { header: "Saldo Akhir", key: "closing", format: money },
      { header: "Belanja/Hari", key: "burnPerDay", format: money }, { header: "Cukup (hari)", key: "daysLeft", format: "decimal" }, { header: "Rencana Top Up", key: "planned", format: money },
    ], a.wallets);
  addTableSheet(wb, "Leads per Sumber", [
    { header: "Sumber", key: "name", width: 20 }, { header: "Leads", key: "leads", format: "number" }, { header: "HOT", key: "hot", format: "number" },
    { header: "Deal", key: "deals", format: "number" }, { header: "Conversion", key: "dealRate", format: "percent" }, { header: "Ghosting", key: "ghost", format: "number" },
    { header: "Biaya", key: "cost", format: money }, { header: "CPL", key: "cpl", format: money }, { header: "Biaya/Deal", key: "cpa", format: money },
  ], a.leadsBySource);
  addTableSheet(wb, "Follow Up Jatuh Tempo", [
    { header: "Nama", key: "name", width: 22 }, { header: "No. WA", key: "phone", width: 16 }, { header: "Brand", key: "brand" }, { header: "Segmen", key: "segment" },
    { header: "Sumber", key: "source" }, { header: "Tgl Chat", key: "chat_date" }, { header: "Umur (hari)", key: "age" }, { header: "Follow Up ke-", key: "stage" }, { header: "Kebutuhan", key: "need", width: 40 },
  ], a.followUps);
  addTableSheet(wb, "Konten per Channel", [
    { header: "Channel", key: "name", width: 20 }, { header: "Rencana", key: "planned" }, { header: "Tayang", key: "posted" }, { header: "Rata ER", key: "avgER", format: "percent" }, { header: "Reach", key: "reach", format: "number" },
  ], a.contentByChannel);
  addTableSheet(wb, "Konten per Pilar", [
    { header: "Pilar", key: "name", width: 20 }, { header: "Rencana", key: "planned" }, { header: "Tayang", key: "posted" }, { header: "Rata ER", key: "avgER", format: "percent" }, { header: "Reach", key: "reach", format: "number" },
  ], a.contentByPillar);
  addTableSheet(wb, "Top & Bottom Konten", [
    { header: "Ranking", key: "rank" }, { header: "Judul", key: "title", width: 40 }, { header: "Channel", key: "channel" }, { header: "Pilar", key: "pillar" }, { header: "ER", key: "er", format: "percent" }, { header: "Reach", key: "reach", format: "number" },
  ], [...a.topContent.map((c, i) => ({ rank: `Top ${i + 1}`, ...c })), ...a.bottomContent.map((c, i) => ({ rank: `Bottom ${i + 1}`, ...c }))]);
  addTableSheet(wb, "Google Review per Cabang", [
    { header: "Cabang", key: "name", width: 20 }, { header: "Ulasan", key: "reviews" }, { header: "Rata Rating", key: "avgRating", format: "decimal" },
    { header: "Positif", key: "positive" }, { header: "Negatif", key: "negative" }, { header: "Response Rate", key: "responseRate", format: "percent" },
  ], a.reviewsByBranch);
  addTableSheet(wb, "WA Blast", [
    { header: "Blast", key: "name", width: 28 }, { header: "Tanggal", key: "date" }, { header: "Terkirim", key: "sent" }, { header: "Delivered", key: "delivered" }, { header: "Dibaca", key: "read" },
    { header: "Dibalas", key: "replied" }, { header: "Reply Rate", key: "replyRate", format: "percent" }, { header: "Leads", key: "leads" }, { header: "Deal", key: "deals" },
    { header: "Biaya", key: "cost", format: money }, { header: "Biaya/Lead", key: "cpl", format: money },
  ], a.blastList);
  addTableSheet(wb, "Influencer", [
    { header: "Influencer", key: "name", width: 24 }, { header: "Platform", key: "platform" }, { header: "Fee", key: "fee", format: money }, { header: "Views", key: "views", format: "number" },
    { header: "Engagement", key: "engagement", format: "number" }, { header: "Leads", key: "leads" }, { header: "Omzet", key: "revenue", format: money },
    { header: "Biaya/Engagement", key: "cpe", format: money }, { header: "ROI", key: "roi", format: "percent" },
  ], a.influencerList);

  return { wb, a };
}
