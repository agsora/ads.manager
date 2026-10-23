import { getSetting, logActivity, q, setSetting } from "./db";
import { buildAnalytics } from "./analytics";
import { buildReportWorkbook } from "./report";
import { appUrl, emailEnabled, renderEmail, sendEmails, type EmailSection } from "./email";
import { notify, orgUsers, wantsEmail } from "./notify";
import { refreshContentMetrics } from "./metrics-sync";
import { aiConfigured, generateAdvice, lastAdvice } from "./ai-advice";
import { driveEnabled, saveFileRecord, uploadFromServer } from "./drive";
import { addDays, fmtDate, fmtMoney, fmtNum, fmtPct, monthEnd, monthStart, todayISO } from "./format";
import type { Row } from "./resources";

export interface DailyResult {
  orgId: number;
  closedCampaigns: number;
  alerts: number;
  digestEmails: number;
  weeklyEmails: number;
  skipped?: string;
}

/**
 * Daily automation for one workspace:
 *  1. campaigns still "Running" after their end date → "Done"
 *  2. in-app alerts: overdue content, pending approvals, missing results, HOT follow ups, low ad balance, negative reviews
 *  3. morning digest email
 *  4. on Mondays (or when forced) the weekly report email with the Excel attached
 */
export async function runDaily(orgId: number, opts: { force?: boolean; weekly?: boolean; req?: Request } = {}): Promise<DailyResult> {
  const today = todayISO();
  const guard = `daily:${orgId}:${today}`;
  if (!opts.force && (await getSetting(guard))) return { orgId, closedCampaigns: 0, alerts: 0, digestEmails: 0, weeklyEmails: 0, skipped: "sudah dijalankan hari ini" };
  await setSetting(guard, new Date().toISOString());

  const base = appUrl(opts.req);
  const closed = await q(`UPDATE ad_campaigns SET status = 'Done', updated_at = now() WHERE org_id = $1 AND status = 'Running' AND end_date < $2 RETURNING id`, [orgId, today]);

  // pull fresh numbers from the links of content posted in the last 14 days (max 25 per run)
  const linked = await q<{ id: number }>(
    `SELECT id FROM content_plans WHERE org_id = $1 AND status = 'Posted' AND COALESCE(actual_date, post_date) >= $2 AND (post_link IS NOT NULL OR brief_link IS NOT NULL) ORDER BY post_date DESC LIMIT 25`,
    [orgId, addDays(today, -14)],
  );
  const synced = linked.length ? await refreshContentMetrics(orgId, linked.map((l) => l.id)).catch(() => ({ updated: 0, failed: [] })) : { updated: 0, failed: [] };

  const content = await q<Row>(`SELECT * FROM content_plans WHERE org_id = $1 AND post_date BETWEEN $2 AND $3 ORDER BY post_date, post_time NULLS LAST`, [orgId, addDays(today, -14), addDays(today, 1)]);
  const live = content.filter((c) => c.status !== "Cancel");
  const todays = live.filter((c) => String(c.post_date) === today);
  const tomorrow = live.filter((c) => String(c.post_date) === addDays(today, 1));
  const overdue = live.filter((c) => String(c.post_date) < today && c.status !== "Posted");
  const pendingApproval = live.filter((c) => c.approval_status === "Menunggu review" || c.approval_status === "Perlu revisi");
  const missingResults = live.filter((c) => c.status === "Posted" && String(c.post_date) <= addDays(today, -2) && !Number(c.likes) && !Number(c.reach) && !Number(c.views));

  const a = await buildAnalytics(orgId, { from: monthStart(today), to: monthEnd(today) });
  const hot = a.followUps.filter((f) => String(f.segment ?? "").toUpperCase() === "HOT");
  const lowWallets = a.wallets.filter((w) => w.closing < 0 || (w.daysLeft !== null && w.daysLeft < 7));
  const negative = a.unanswered.filter((u) => u.rating > 0 && u.rating <= 3);
  const critical = a.insights.filter((i) => i.level === "critical");

  // ---- in-app alerts (one per topic per day; email goes out in the digest instead)
  let alerts = 0;
  const alert = async (title: string, body: string, link: string) => {
    await notify({ orgId, category: "alerts", title, body, link, skipActor: false });
    alerts++;
  };
  if (overdue.length) await alert(`${overdue.length} konten terlewat jadwal`, overdue.slice(0, 3).map((c) => `${c.title} (${fmtDate(c.post_date)})`).join(", "), "/content");
  if (pendingApproval.length) await alert(`${pendingApproval.length} konten menunggu review/revisi`, pendingApproval.slice(0, 3).map((c) => String(c.title)).join(", "), "/content");
  if (missingResults.length) await alert(`${missingResults.length} konten tayang belum diisi hasilnya`, "Isi like, comment, saved & followers agar engagement rate terhitung.", "/content");
  if (hot.length) await alert(`${hot.length} lead HOT jatuh tempo follow up`, hot.slice(0, 4).map((f) => `${f.name} (${f.age} hari)`).join(", "), "/leads/followup");
  for (const w of lowWallets) await alert(`Saldo iklan ${w.brand} · ${w.platform} menipis`, `Sisa ${fmtMoney(w.closing)}${w.daysLeft !== null ? `, cukup ±${fmtNum(w.daysLeft, 0)} hari` : ""}.`, "/ads/budget");
  if (negative.length) await alert(`${negative.length} ulasan negatif belum dibalas`, negative.slice(0, 3).map((n) => `${n.reviewer ?? "Anonim"} ${n.rating}★`).join(", "), "/reviews");
  if (closed.length) await alert(`${closed.length} campaign otomatis ditandai Done`, "Tanggal berakhirnya sudah lewat.", "/ads");

  // fresh AI advice every morning (only when an AI key is configured), so nobody has to click anything
  if (aiConfigured()) {
    try {
      const prev = await lastAdvice(orgId);
      if (!prev || prev.at.slice(0, 10) !== today) {
        const out = await generateAdvice({ orgId, from: monthStart(today), to: monthEnd(today), brand: null, focus: "auto", previousTitles: prev?.advice.saran.map((x) => x.judul) ?? [] });
        await alert("Saran AI hari ini sudah siap", out.advice.ringkasan.slice(0, 160), "/insights");
      }
    } catch (e) {
      console.error("daily ai advice", e instanceof Error ? e.message : e);
    }
  }
  // broadcasts scheduled for today/tomorrow that are not sent yet
  const dueBlasts = await q<Row>(
    `SELECT campaign_name, blast_date, blast_time, brand FROM wa_blasts WHERE org_id = $1 AND blast_date BETWEEN $2 AND $3 AND COALESCE(status, 'Draft') IN ('Draft', 'Terjadwal') ORDER BY blast_date, blast_time NULLS LAST`,
    [orgId, today, addDays(today, 1)],
  );
  if (dueBlasts.length)
    await alert(
      `${dueBlasts.length} broadcast WhatsApp akan dikirim`,
      dueBlasts.slice(0, 3).map((b) => `${b.campaign_name} (${String(b.blast_date) === today ? "hari ini" : "besok"}${b.blast_time ? ` ${String(b.blast_time).slice(0, 5)}` : ""})`).join(", "),
      "/blast/schedule",
    );
  // promo preparation steps that start today: teaser content H-7, ads H-5, blast H-2
  const promoSteps = [
    { lead: 7, label: "siapkan konten teaser" },
    { lead: 5, label: "mulai tayang iklan" },
    { lead: 2, label: "kirim blast WhatsApp" },
  ];
  for (const st of promoSteps) {
    const evs = await q<Row>(`SELECT title FROM marketing_events WHERE org_id = $1 AND event_date = $2`, [orgId, addDays(today, st.lead)]);
    if (evs.length) await alert(`H-${st.lead}: ${st.label}`, evs.slice(0, 3).map((e) => String(e.title)).join(", "), "/promo");
  }

  // ---- digest email
  const users = await orgUsers(orgId);
  let digestEmails = 0;
  if (emailEnabled()) {
    const line = (c: Row) => `${c.post_time ? `${c.post_time} · ` : ""}${c.title} — ${c.channel ?? "-"}${c.brand ? ` · ${c.brand}` : ""} [${c.status ?? "-"}]`;
    const sections: EmailSection[] = [
      { title: `Konten hari ini (${todays.length})`, items: todays.map(line), empty: "Tidak ada konten terjadwal hari ini." },
      { title: `Konten besok (${tomorrow.length})`, items: tomorrow.map(line), empty: "Belum ada konten untuk besok." },
    ];
    if (overdue.length) sections.push({ title: `Terlewat jadwal (${overdue.length})`, items: overdue.slice(0, 10).map((c) => `${fmtDate(c.post_date)} · ${c.title} [${c.status ?? "-"}]`) });
    if (pendingApproval.length) sections.push({ title: `Menunggu review / revisi (${pendingApproval.length})`, items: pendingApproval.slice(0, 10).map((c) => `${c.title} — ${c.approval_status}`) });
    if (missingResults.length) sections.push({ title: `Hasil konten belum diisi (${missingResults.length})`, items: missingResults.slice(0, 10).map((c) => `${fmtDate(c.post_date)} · ${c.title}`) });
    if (a.followUps.length) sections.push({ title: `Follow up jatuh tempo (${a.followUps.length})`, items: a.followUps.slice(0, 10).map((f) => `${f.segment ?? "-"} · ${f.name} · ${f.age} hari · FU${f.stage > 3 ? "✓" : f.stage}`) });
    if (lowWallets.length) sections.push({ title: "Saldo iklan menipis", items: lowWallets.map((w) => `${w.brand} · ${w.platform}: ${fmtMoney(w.closing)}`) });
    if (negative.length) sections.push({ title: "Ulasan negatif belum dibalas", items: negative.map((n) => `${n.reviewer ?? "Anonim"} (${n.rating}★) — ${String(n.comment ?? "").slice(0, 80)}`) });
    const advToday = await lastAdvice(orgId);
    if (advToday && advToday.at.slice(0, 10) === today)
      sections.push({ title: "Saran AI hari ini", items: [advToday.advice.ringkasan, ...advToday.advice.saran.slice(0, 3).map((x) => `[${x.prioritas}] ${x.judul} — ${x.langkah[0] ?? ""}`)] });
    if (critical.length) sections.push({ title: "Insight kritis", items: critical.map((i) => `${i.title} → ${i.action}`) });
    sections.push({
      title: "Bulan ini sejauh ini",
      rows: [
        ["Belanja iklan", fmtMoney(a.kpis.ads.spend)],
        ["Percakapan dari ads", fmtNum(a.kpis.ads.conversations)],
        ["Leads / deal", `${a.kpis.leads.leads} / ${a.kpis.leads.deals} (${fmtPct(a.kpis.leads.dealRate)})`],
        ["Konten tayang", `${a.kpis.content.posted} dari ${a.kpis.content.planned}`],
      ],
    });
    const html = renderEmail({
      eyebrow: `Ringkasan harian · ${fmtDate(today)}`,
      title: todays.length ? `${todays.length} konten tayang hari ini` : "Ringkasan pagi Anda",
      intro: `${overdue.length} terlewat · ${pendingApproval.length} menunggu review · ${a.followUps.length} follow up jatuh tempo.`,
      sections,
      cta: { label: "Buka dashboard", url: base },
    });
    const res = await sendEmails(users.filter((u) => wantsEmail(u, "digest")).map((u) => ({ to: u.email, subject: `Ringkasan harian ${fmtDate(today)} — Ads Manager`, html })));
    digestEmails = res.sent;
  }

  // ---- weekly report (Monday)
  let weeklyEmails = 0;
  const isMonday = new Date(today + "T00:00:00Z").getUTCDay() === 1;
  if ((opts.weekly ?? isMonday) && emailEnabled()) {
    const from = addDays(today, -7);
    const to = addDays(today, -1);
    const { wb, a: w } = await buildReportWorkbook(orgId, from, to);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const file = buffer.toString("base64");
    let driveLink: string | null = null;
    if (await driveEnabled()) {
      try {
        const folder = `Laporan/Mingguan/${today.slice(0, 4)}`;
        const up = await uploadFromServer(folder, `laporan-${from}_${to}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer);
        await saveFileRecord({ orgId, resource: "report", recordId: null, folderPath: folder, name: `laporan-${from}_${to}.xlsx`, driveId: up.id, url: up.url, folderUrl: up.folderUrl, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: buffer.length, by: "Otomasi" });
        driveLink = up.url;
      } catch (e) {
        console.error("report to drive failed", e);
      }
    }
    const html = renderEmail({
      eyebrow: `Laporan mingguan · ${fmtDate(from)} – ${fmtDate(to)}`,
      title: "Ringkasan 7 hari terakhir",
      intro: `Skor kesehatan marketing ${w.scores.overall ?? "–"}/100. Laporan lengkap terlampir (Excel).`,
      sections: [
        {
          title: "Angka utama",
          rows: [
            ["Belanja iklan", `${fmtMoney(w.kpis.ads.spend)} (vs ${fmtMoney(w.prevKpis.ads.spend)})`],
            ["CTR · CPC", `${fmtPct(w.kpis.ads.ctr, 2)} · ${fmtMoney(w.kpis.ads.cpc)}`],
            ["Biaya per percakapan", fmtMoney(w.kpis.ads.costPerConv)],
            ["Leads", `${w.kpis.leads.leads} (vs ${w.prevKpis.leads.leads})`],
            ["Deal · conversion", `${w.kpis.leads.deals} · ${fmtPct(w.kpis.leads.dealRate)}`],
            ["Konten tayang · ER", `${w.kpis.content.posted} · ${fmtPct(w.kpis.content.avgER, 2)}`],
            ["Rating Google", w.kpis.reviews.avgRating ? `${fmtNum(w.kpis.reviews.avgRating, 2)}★` : "–"],
          ],
        },
        { title: "Yang perlu dilakukan", items: w.insights.filter((i) => i.level === "critical" || i.level === "warning").slice(0, 8).map((i) => `${i.title} → ${i.action}`), empty: "Tidak ada masalah besar minggu ini." },
        { title: "Yang sudah bagus", items: w.insights.filter((i) => i.level === "good").slice(0, 5).map((i) => i.title) },
      ],
      cta: { label: driveLink ? "Buka laporan di Drive" : "Buka laporan", url: driveLink ?? `${base}/reports` },
    });
    const managers = users.filter((u) => ["superadmin", "owner", "admin"].includes(u.role) && wantsEmail(u, "weekly"));
    const res = await sendEmails(managers.map((u) => ({ to: u.email, subject: `Laporan mingguan ${fmtDate(from)} – ${fmtDate(to)}`, html, attachments: [{ filename: `laporan-${from}_${to}.xlsx`, content: file }] })));
    weeklyEmails = res.sent;
    if (res.sent) await notify({ orgId, category: "weekly", title: "Laporan mingguan terkirim", body: `Dikirim ke ${res.sent} email (owner/admin).`, link: "/reports", skipActor: false, userIds: managers.map((m) => m.id) });
  }

  await logActivity(orgId, "Otomasi", "Otomasi harian", `${synced.updated} metrik konten diperbarui · ${closed.length} campaign ditutup · ${alerts} peringatan · ${digestEmails} digest · ${weeklyEmails} laporan mingguan`);
  return { orgId, closedCampaigns: closed.length, alerts, digestEmails, weeklyEmails };
}
