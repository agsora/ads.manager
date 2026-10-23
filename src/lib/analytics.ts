import { listRows } from "./repo";
import { RESOURCE_MAP, n, type Row } from "./resources";
import { addDays, diffDays, fmtMoney, fmtNum, fmtPct, monthEnd, monthStart, todayISO } from "./format";

export type Level = "critical" | "warning" | "good" | "info";
export interface Insight {
  level: Level;
  area: "Ads" | "Leads" | "WA Blast" | "Konten" | "Reputasi" | "Influencer" | "Budget" | "Umum";
  title: string;
  detail: string;
  action: string;
}

const div = (a: number, b: number) => (b ? a / b : null);
const sum = (rows: Row[], k: string) => rows.reduce((s, r) => s + n(r[k]), 0);
const inRange = (d: unknown, from: string, to: string) => {
  const s = String(d ?? "").slice(0, 10);
  return !!s && s >= from && s <= to;
};
const groupBy = <T extends Row>(rows: T[], key: (r: T) => string) => {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r) || "(Kosong)";
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return m;
};
const lc = (v: unknown) => String(v ?? "").toLowerCase();
const WEEKDAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** Campaign spend that falls inside [from,to], pro-rated by days for multi-day campaigns. */
function spendIn(r: Row, from: string, to: string) {
  const s = String(r.start_date ?? "").slice(0, 10);
  const e = String(r.end_date ?? r.start_date ?? "").slice(0, 10) || s;
  if (!s) return 0;
  const total = Math.max(1, diffDays(s, e) + 1);
  const os = s > from ? s : from;
  const oe = e < to ? e : to;
  const overlap = diffDays(os, oe) + 1;
  if (overlap <= 0) return 0;
  return (n(r.spend) * overlap) / total;
}

function adsKpis(ads: Row[]) {
  const spend = sum(ads, "spend");
  const impressions = sum(ads, "impressions");
  const reach = sum(ads, "reach");
  const clicks = sum(ads, "clicks");
  const conversations = sum(ads, "conversations");
  const revenue = sum(ads, "revenue");
  return {
    spend, impressions, reach, clicks, conversations, revenue,
    ctr: div(clicks, impressions),
    cpc: div(spend, clicks),
    cpm: impressions ? (spend / impressions) * 1000 : null,
    costPerConv: div(spend, conversations),
    // ROAS = pendapatan iklan ÷ biaya iklan; ROI = (pendapatan − biaya) ÷ biaya
    roas: div(revenue, spend),
    roi: spend && revenue ? (revenue - spend) / spend : null,
    frequency: div(impressions, reach),
    // daily rows from a Meta export belong to one campaign: count distinct campaigns
    campaigns: new Set(ads.map((r) => `${r.brand}|${r.platform}|${r.campaign_name}`)).size,
    running: new Set(ads.filter((r) => r.status === "Running").map((r) => `${r.brand}|${r.platform}|${r.campaign_name}`)).size,
  };
}

function leadKpis(leads: Row[]) {
  const total = leads.length;
  const deals = leads.filter((r) => r.final_status === "Deal" || r.initial_status === "Deal" || /akad/i.test(String(r.pipeline_stage ?? ""))).length;
  const hot = leads.filter((r) => lc(r.segment) === "hot").length;
  const warm = leads.filter((r) => lc(r.segment) === "warm").length;
  const cold = leads.filter((r) => lc(r.segment) === "cold").length;
  const ghost = leads.filter((r) => r.final_status === "Ghosting").length;
  const cancel = leads.filter((r) => r.final_status === "Cancel").length;
  const closed = leads.filter((r) => ["Deal", "Cancel", "Ghosting"].includes(String(r.final_status))).length;
  return {
    leads: total, deals, hot, warm, cold, ghost, cancel,
    open: total - closed,
    dealRate: div(deals, total),
    ghostRate: div(ghost, total),
    dealValue: sum(leads, "deal_value"),
    repeat: leads.filter((r) => /repeat|langganan/i.test(String(r.customer_type ?? ""))).length,
  };
}

function contentKpis(content: Row[]) {
  const planned = content.filter((r) => r.status !== "Cancel").length;
  const posted = content.filter((r) => r.status === "Posted");
  const withEr = posted.filter((r) => n(r.followers) > 0);
  const ers = withEr.map((r) => (n(r.likes) + n(r.comments) + n(r.saves)) / n(r.followers));
  const onTime = posted.filter((r) => r.actual_date && String(r.actual_date) <= String(r.post_date)).length;
  const postedWithActual = posted.filter((r) => r.actual_date).length;
  return {
    planned,
    posted: posted.length,
    completionRate: div(posted.length, planned),
    onTimeRate: div(onTime, postedWithActual),
    avgER: ers.length ? ers.reduce((a, b) => a + b, 0) / ers.length : null,
    reach: sum(posted, "reach"),
    engagement: sum(posted, "likes") + sum(posted, "comments") + sum(posted, "saves") + sum(posted, "shares"),
  };
}

function reviewKpis(reviews: Row[]) {
  const rated = reviews.filter((r) => n(r.rating) > 0);
  const responded = reviews.filter((r) => r.responded === "Ya").length;
  return {
    reviews: reviews.length,
    avgRating: rated.length ? sum(rated, "rating") / rated.length : null,
    responseRate: div(responded, reviews.length),
    negative: reviews.filter((r) => r.sentiment === "Negatif" || (n(r.rating) > 0 && n(r.rating) <= 2)).length,
    positive: reviews.filter((r) => r.sentiment === "Positif" || n(r.rating) >= 4).length,
  };
}

function blastKpis(blasts: Row[]) {
  const sent = sum(blasts, "sent");
  const delivered = sum(blasts, "delivered") || sent;
  return {
    blasts: blasts.length,
    sent,
    delivered: sum(blasts, "delivered"),
    read: sum(blasts, "read_count"),
    replied: sum(blasts, "replied"),
    leads: sum(blasts, "leads"),
    deals: sum(blasts, "deals"),
    cost: sum(blasts, "cost"),
    revenue: sum(blasts, "revenue"),
    deliveryRate: div(sum(blasts, "delivered"), sent),
    readRate: div(sum(blasts, "read_count"), delivered),
    replyRate: div(sum(blasts, "replied"), delivered),
  };
}

function influencerKpis(rows: Row[]) {
  const fee = sum(rows, "fee");
  const revenue = sum(rows, "revenue");
  return {
    collabs: rows.length,
    fee,
    views: sum(rows, "views"),
    engagement: sum(rows, "engagement"),
    leads: sum(rows, "leads"),
    revenue,
    roi: fee && revenue ? (revenue - fee) / fee : null,
    cpe: div(fee, sum(rows, "engagement")),
  };
}

export interface AnalyticsParams {
  from: string;
  to: string;
  brand?: string | null;
}

export async function buildAnalytics(orgId: number, p: AnalyticsParams) {
  const { from, to } = p;
  const brand = p.brand || null;
  const today = todayISO();
  const len = Math.max(1, diffDays(from, to) + 1);
  // compare like-for-like: a month-to-date window is compared with the same number of elapsed days before it
  const cmpLen = to > today && from <= today ? diffDays(from, today) + 1 : len;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(cmpLen - 1));

  const load = (key: string, f: string, t: string, limit?: number) => listRows(orgId, RESOURCE_MAP[key], { from: f, to: t, brand, limit });
  const [adsAll, leadsAll, contentAll, reviewsAll, blastAll, inflAll, kpiRows, walletRows, events, followers, openLeads, upcomingContent, contactsAll, statRows, adsHistory, blastHistory, inflHistory] =
    await Promise.all([
      // campaigns may start before the window and still spend in it
      load("ads", addDays(prevFrom, -90), to),
      load("leads", prevFrom, to),
      load("content", prevFrom, to),
      load("reviews", prevFrom, to),
      load("blast", prevFrom, to),
      load("influencers", prevFrom, to),
      load("kpi", monthStart(from), to),
      load("wallets", "1900-01-01", to),
      load("events", today, addDays(today, 30)),
      load("followers", addDays(from, -120), to),
      load("leads", addDays(today, -60), today),
      load("content", today, addDays(today, 7)),
      load("contacts", prevFrom, to),
      load("review_stats", "1900-01-01", to),
      // the balance carries over month to month, so it needs every campaign since the first top up
      load("ads", "1900-01-01", to, 20000),
      // blast and influencer costs can be paid from the same top-ups, so they also draw down a wallet
      load("blast", "1900-01-01", to, 20000),
      load("influencers", "1900-01-01", to, 20000),
    ]);

  const overlapAds = (f: string, t: string) =>
    adsAll
      .filter((r) => spendIn(r, f, t) > 0 || inRange(r.start_date, f, t))
      .map((r) => {
        // pro-rate all volume metrics to the window so trends are comparable
        const ratio = n(r.spend) ? spendIn(r, f, t) / n(r.spend) : inRange(r.start_date, f, t) ? 1 : 0;
        const out: Row = { ...r };
        for (const k of ["spend", "impressions", "reach", "clicks", "views", "conversations", "revenue"]) out[k] = n(r[k]) * ratio;
        return out;
      });
  const effTo = to > today ? (from > today ? to : today) : to; // spend can't happen in the future
  const ads = overlapAds(from, effTo);
  const adsPrev = overlapAds(prevFrom, prevTo);
  const cur = <T extends Row>(rows: T[], key: string) => rows.filter((r) => inRange(r[key], from, to));
  const prev = <T extends Row>(rows: T[], key: string) => rows.filter((r) => inRange(r[key], prevFrom, prevTo));

  const leads = cur(leadsAll, "chat_date");
  const content = cur(contentAll, "post_date");
  const reviews = cur(reviewsAll, "review_date");
  const blasts = cur(blastAll, "blast_date");
  const infl = cur(inflAll, "post_date");

  const adsK = adsKpis(ads);
  // when no revenue is typed on campaigns, fall back to deals logged in WA Leads that came from ads
  const adsLeadDeals = sum(leads.filter((r) => /ads|iklan/i.test(String(r.source ?? "")) && (r.final_status === "Deal" || r.initial_status === "Deal")), "deal_value");
  const roasFromLeads = !adsK.revenue && adsLeadDeals > 0 && adsK.spend > 0;
  if (roasFromLeads) {
    adsK.revenue = adsLeadDeals;
    adsK.roas = adsLeadDeals / adsK.spend;
    adsK.roi = (adsLeadDeals - adsK.spend) / adsK.spend;
  }
  const kpis = {
    ads: adsK,
    leads: leadKpis(leads),
    content: contentKpis(content),
    reviews: reviewKpis(reviews),
    blast: blastKpis(blasts),
    influencer: influencerKpis(infl),
  };
  const prevKpis = {
    ads: adsKpis(adsPrev),
    leads: leadKpis(prev(leadsAll, "chat_date")),
    content: contentKpis(prev(contentAll, "post_date")),
    reviews: reviewKpis(prev(reviewsAll, "review_date")),
    blast: blastKpis(prev(blastAll, "blast_date")),
    influencer: influencerKpis(prev(inflAll, "post_date")),
  };
  const totalCost = kpis.ads.spend + kpis.blast.cost + kpis.influencer.fee;
  const totalRevenue = kpis.ads.revenue + kpis.blast.revenue + kpis.influencer.revenue + kpis.leads.dealValue;
  const overall = {
    totalCost,
    leads: kpis.leads.leads,
    cpl: div(totalCost, kpis.leads.leads),
    cpa: div(totalCost, kpis.leads.deals),
    dealValue: kpis.leads.dealValue,
    revenueTracked: totalRevenue,
  };

  // ---- trend (daily if <= 62 days, else weekly)
  const bucket = len <= 62 ? (d: string) => d : (d: string) => {
    const k = diffDays(from, d);
    return addDays(from, Math.floor(k / 7) * 7);
  };
  const trendMap = new Map<string, { date: string; spend: number; leads: number; deals: number; conversations: number; posts: number }>();
  for (let d = from; d <= to; d = addDays(d, len <= 62 ? 1 : 7)) trendMap.set(d, { date: d, spend: 0, leads: 0, deals: 0, conversations: 0, posts: 0 });
  for (const r of ads) {
    const s = String(r.start_date).slice(0, 10);
    const e = String(r.end_date ?? r.start_date).slice(0, 10) || s;
    const days = Math.max(1, diffDays(s, e) + 1);
    const orig = adsAll.find((x) => x.id === r.id)!;
    for (let d = s > from ? s : from; d <= (e < effTo ? e : effTo); d = addDays(d, 1)) {
      const t = trendMap.get(bucket(d));
      if (t) {
        t.spend += n(orig.spend) / days;
        t.conversations += n(orig.conversations) / days;
      }
    }
  }
  for (const r of leads) {
    const t = trendMap.get(bucket(String(r.chat_date).slice(0, 10)));
    if (t) {
      t.leads++;
      if (r.final_status === "Deal") t.deals++;
    }
  }
  for (const r of content) {
    const t = trendMap.get(bucket(String(r.post_date).slice(0, 10)));
    if (t && r.status === "Posted") t.posts++;
  }
  const trend = [...trendMap.values()].map((t) => ({ ...t, spend: Math.round(t.spend), conversations: Math.round(t.conversations * 10) / 10 }));

  // ---- ads breakdowns
  const breakdown = (rows: Row[], key: string) =>
    [...groupBy(rows, (r) => String(r[key] ?? "")).entries()]
      .map(([name, rs]) => ({ name, ...adsKpis(rs) }))
      .sort((a, b) => b.spend - a.spend);
  const byPlatform = breakdown(ads, "platform");
  const byBrand = breakdown(ads, "brand");
  const byObjective = breakdown(ads, "objective");
  const campaigns = [...groupBy(ads, (r) => `${r.brand}|${r.platform}|${r.campaign_name}`).values()]
    .map((rs) => {
      const k = adsKpis(rs);
      const starts = rs.map((r) => String(r.start_date ?? "")).filter(Boolean).sort();
      const ends = rs.map((r) => String(r.end_date ?? r.start_date ?? "")).filter(Boolean).sort();
      const latest = [...rs].sort((a, b) => String(b.end_date ?? b.start_date).localeCompare(String(a.end_date ?? a.start_date)))[0];
      return {
        id: latest.id, name: String(latest.campaign_name), brand: latest.brand, platform: latest.platform,
        status: rs.some((r) => r.status === "Running") || String(latest.end_date ?? latest.start_date ?? "") >= addDays(today, -1) ? "Running" : latest.status === "Running" ? "Done" : latest.status, objective: latest.objective,
        rawRevenue: rs.reduce((t, r) => t + n(adsAll.find((x) => x.id === r.id)?.revenue), 0), rawLatestRevenue: n(adsAll.find((x) => x.id === latest.id)?.revenue), latestRowId: latest.id, attrLeads: 0, attrDeals: 0, attrValue: 0,
        ...k, days: rs.length, start_date: starts[0], end_date: ends[ends.length - 1],
      };
    })
    .sort((a, b) => b.spend - a.spend);

  // ---- atribusi: leads yang punya kode campaign → leads / deal / omzet per campaign iklan
  const normRef = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const attribution = [...groupBy(leads.filter((r) => r.campaign_ref), (r) => normRef(r.campaign_ref)).entries()]
    .map(([nr, rs]) => {
      const ref = String(rs[0].campaign_ref).trim();
      const matched = campaigns.filter((c) => {
        const nc = normRef(c.name);
        return nc === nr || (nr.length >= 4 && nc.length >= 4 && (nc.includes(nr) || nr.includes(nc)));
      });
      const spend = matched.reduce((t, c) => t + c.spend, 0);
      const k = leadKpis(rs);
      for (const c of matched) {
        c.attrLeads += k.leads / matched.length;
        c.attrDeals += k.deals / matched.length;
        c.attrValue += k.dealValue / matched.length;
      }
      return {
        ref, leads: k.leads, hot: k.hot, deals: k.deals, dealRate: k.dealRate, dealValue: k.dealValue,
        spend: matched.length ? spend : null, matched: matched.map((m) => m.name),
        cpl: spend && k.leads ? spend / k.leads : null, cpa: spend && k.deals ? spend / k.deals : null, roas: spend && k.dealValue ? k.dealValue / spend : null,
      };
    })
    .sort((a, b) => b.leads - a.leads);

  // ---- leads breakdowns
  const sourceCost = (source: string) => {
    const s = lc(source);
    if (s.includes("meta") || s.includes("facebook") || s.includes("instagram ads")) return sum(ads.filter((r) => lc(r.platform).includes("meta")), "spend");
    if (s.includes("tiktok")) return sum(ads.filter((r) => lc(r.platform).includes("tiktok")), "spend");
    if (s.includes("google")) return sum(ads.filter((r) => lc(r.platform).includes("google")), "spend");
    if (s.includes("blast")) return kpis.blast.cost;
    if (s.includes("influencer")) return kpis.influencer.fee;
    return 0;
  };
  const leadsBySource = [...groupBy(leads, (r) => String(r.source ?? "").trim()).entries()]
    .map(([name, rs]) => {
      const k = leadKpis(rs);
      const cost = sourceCost(name);
      return { name, leads: k.leads, hot: k.hot, deals: k.deals, dealRate: k.dealRate, ghost: k.ghost, cost, cpl: cost ? div(cost, k.leads) : null, cpa: cost ? div(cost, k.deals) : null };
    })
    .sort((a, b) => b.leads - a.leads);
  const countBy = (rows: Row[], key: string) =>
    [...groupBy(rows, (r) => String(r[key] ?? "").trim()).entries()].map(([name, rs]) => ({ name, value: rs.length })).sort((a, b) => b.value - a.value);
  const leadSegments = countBy(leads, "segment");
  const leadFinal = countBy(leads, "final_status");
  const leadsByBrand = [...groupBy(leads, (r) => String(r.brand ?? "")).entries()].map(([name, rs]) => ({ name, ...leadKpis(rs) }));
  const followUps = openLeads
    .filter((r) => !["Deal", "Cancel", "Ghosting"].includes(String(r.final_status)))
    .map((r) => {
      const age = diffDays(String(r.chat_date).slice(0, 10), today);
      const stage = !r.followup_1 ? 1 : !r.followup_2 ? 2 : !r.followup_3 ? 3 : 4;
      const dueAt = [3, 7, 14, 30][stage - 1];
      return { id: r.id, name: r.name || r.phone || "(tanpa nama)", phone: r.phone, brand: r.brand, segment: r.segment, source: r.source, chat_date: r.chat_date, age, stage, due: age >= dueAt, need: r.need };
    })
    .filter((r) => r.due)
    .sort((a, b) => (lc(a.segment) === "hot" ? -1 : 0) - (lc(b.segment) === "hot" ? -1 : 0) || b.age - a.age);

  // funnel
  const funnel = [
    { name: "Impresi", value: kpis.ads.impressions },
    { name: "Klik", value: kpis.ads.clicks },
    { name: "Percakapan Ads", value: kpis.ads.conversations },
    { name: "Total Leads", value: kpis.leads.leads },
    { name: "Deal", value: kpis.leads.deals },
  ];

  // ---- pembiayaan: lead → survei → approve → akad, per cabang & per CS, plus kecepatan respons chat
  const stageRank = (r: Row) => {
    const st = String(r.pipeline_stage ?? "");
    if (/akad|cair/i.test(st) || r.final_status === "Deal" || r.initial_status === "Deal") return 3;
    if (/approve/i.test(st)) return 2;
    if (/survei/i.test(st)) return 1;
    return 0;
  };
  const replyMin = (r: Row) => {
    const t = (v: unknown) => {
      const m = String(v ?? "").match(/^(\d{1,2}):(\d{2})/);
      return m ? +m[1] * 60 + +m[2] : null;
    };
    const a = t(r.chat_time);
    const b = t(r.first_reply_time);
    return a === null || b === null ? null : b >= a ? b - a : b + 1440 - a;
  };
  const finGroup = (rs: Row[]) => {
    const survey = rs.filter((r) => stageRank(r) >= 1).length;
    const approve = rs.filter((r) => stageRank(r) >= 2).length;
    const akadRows = rs.filter((r) => stageRank(r) >= 3);
    const mins = rs.map(replyMin).filter((x): x is number => x !== null);
    return {
      leads: rs.length,
      hot: rs.filter((r) => lc(r.segment) === "hot").length,
      survey,
      approve,
      akad: akadRows.length,
      akadRate: div(akadRows.length, rs.length),
      disbursed: sum(akadRows, "deal_value"),
      replyMeasured: mins.length,
      avgReply: mins.length ? mins.reduce((x, y) => x + y, 0) / mins.length : null,
      within5: mins.length ? mins.filter((x) => x <= 5).length / mins.length : null,
    };
  };
  const finAll = finGroup(leads);
  const sortedMins = leads.map(replyMin).filter((x): x is number => x !== null).sort((x, y) => x - y);
  const financing = {
    funnel: [
      { name: "Lead masuk", value: finAll.leads },
      { name: "Survei", value: finAll.survey },
      { name: "Approve", value: finAll.approve },
      { name: "Akad (cair)", value: finAll.akad },
    ],
    disbursed: finAll.disbursed,
    costPerSurvey: div(totalCost, finAll.survey),
    costPerAkad: div(totalCost, finAll.akad),
    avgTicket: div(finAll.disbursed, finAll.akad),
    tracked: leads.some((r) => r.pipeline_stage),
    sla: {
      measured: sortedMins.length,
      avg: finAll.avgReply,
      median: sortedMins.length ? sortedMins[Math.floor(sortedMins.length / 2)] : null,
      within5: finAll.within5,
      within30: sortedMins.length ? sortedMins.filter((x) => x <= 30).length / sortedMins.length : null,
      over60: sortedMins.filter((x) => x > 60).length,
    },
    byBranch: [...groupBy(leads, (r) => String(r.branch ?? "").trim() || "(Tanpa cabang)").entries()].map(([name, rs]) => ({ name, ...finGroup(rs) })).sort((x, y) => y.leads - x.leads),
    byPic: [...groupBy(leads, (r) => String(r.pic ?? "").trim() || "(Tanpa PIC)").entries()].map(([name, rs]) => ({ name, ...finGroup(rs) })).sort((x, y) => y.leads - x.leads),
  };

  // ---- content breakdowns
  const posted = content.filter((r) => r.status === "Posted");
  const erOf = (r: Row) => (n(r.followers) ? (n(r.likes) + n(r.comments) + n(r.saves)) / n(r.followers) : null);
  const erGroup = (key: string) =>
    [...groupBy(content, (r) => String(r[key] ?? "")).entries()]
      .map(([name, rs]) => {
        const p = rs.filter((r) => r.status === "Posted");
        const ers = p.map(erOf).filter((x): x is number => x !== null);
        return { name, planned: rs.filter((r) => r.status !== "Cancel").length, posted: p.length, avgER: ers.length ? ers.reduce((a, b) => a + b, 0) / ers.length : null, reach: sum(p, "reach") };
      })
      .sort((a, b) => b.planned - a.planned);
  const contentByChannel = erGroup("channel");
  const contentByPillar = erGroup("pillar");
  const contentByType = erGroup("content_type");
  const ranked = posted
    .map((r) => ({ id: r.id, title: String(r.title), channel: r.channel, pillar: r.pillar, content_type: r.content_type, er: erOf(r), reach: n(r.reach), date: r.post_date }))
    .filter((r) => r.er !== null)
    .sort((a, b) => (b.er ?? 0) - (a.er ?? 0));
  const topContent = ranked.slice(0, 5);
  const bottomContent = ranked.length > 5 ? ranked.slice(-5).reverse() : [];
  const weekdayStats = WEEKDAYS.map((name, i) => {
    const rs = posted.filter((r) => new Date(String(r.actual_date ?? r.post_date).slice(0, 10) + "T00:00:00Z").getUTCDay() === i);
    const ers = rs.map(erOf).filter((x): x is number => x !== null);
    return { name, posts: rs.length, avgER: ers.length ? ers.reduce((a, b) => a + b, 0) / ers.length : null };
  });
  const contentStatus = countBy(content, "status");

  // followers growth (latest vs earliest snapshot per channel)
  const followerGrowth = [...groupBy(followers, (r) => `${r.brand} · ${r.channel}`).entries()].map(([name, rs]) => {
    const sorted = [...rs].sort((a, b) => String(a.snapshot_date).localeCompare(String(b.snapshot_date)));
    const inWin = sorted.filter((r) => String(r.snapshot_date) <= to);
    const last = inWin[inWin.length - 1];
    const base = [...inWin].reverse().find((r) => String(r.snapshot_date) < from) ?? inWin[0];
    return { name, current: n(last?.followers), start: n(base?.followers), growth: n(last?.followers) - n(base?.followers), growthRate: div(n(last?.followers) - n(base?.followers), n(base?.followers)) };
  });

  // ---- reviews
  const reviewsByBranch = [...groupBy(reviews, (r) => String(r.branch ?? "")).entries()]
    .map(([name, rs]) => ({ name, ...reviewKpis(rs) }))
    .sort((a, b) => b.reviews - a.reviews);
  const ratingDist = [5, 4, 3, 2, 1].map((s) => ({ name: `${s}★`, value: reviews.filter((r) => Math.round(n(r.rating)) === s).length }));
  const reviewCategories = countBy(reviews, "category");
  const negativeCategories = countBy(reviews.filter((r) => r.sentiment === "Negatif" || n(r.rating) <= 2), "category");
  const unanswered = reviewsAll
    .filter((r) => r.responded !== "Ya" && String(r.review_date) >= addDays(today, -60))
    .sort((a, b) => n(a.rating) - n(b.rating))
    .slice(0, 10)
    .map((r) => ({ id: r.id, reviewer: r.reviewer, rating: n(r.rating), comment: r.comment, branch: r.branch, date: r.review_date }));

  // ---- blasts
  const blastList = blasts.map((r) => ({
    id: r.id, name: String(r.campaign_name), date: r.blast_date, sent: n(r.sent), delivered: n(r.delivered), read: n(r.read_count), replied: n(r.replied), leads: n(r.leads), deals: n(r.deals), cost: n(r.cost),
    replyRate: div(n(r.replied), n(r.delivered) || n(r.sent)), cpl: div(n(r.cost), n(r.leads)),
  }));
  const blastFunnel = [
    { name: "Terkirim", value: kpis.blast.sent },
    { name: "Delivered", value: kpis.blast.delivered },
    { name: "Dibaca", value: kpis.blast.read },
    { name: "Dibalas", value: kpis.blast.replied },
    { name: "Leads", value: kpis.blast.leads },
    { name: "Deal", value: kpis.blast.deals },
  ];

  // ---- influencers
  const influencerList = infl
    .map((r) => ({ id: r.id, name: String(r.influencer), platform: r.platform, fee: n(r.fee), views: n(r.views), engagement: n(r.engagement), leads: n(r.leads), revenue: n(r.revenue), cpe: div(n(r.fee), n(r.engagement)), roi: n(r.fee) && n(r.revenue) ? (n(r.revenue) - n(r.fee)) / n(r.fee) : null }))
    .sort((a, b) => (b.roi ?? -9) - (a.roi ?? -9));

  // ---- blast contacts (target list format: contract, unit type, plafon, status)
  const contacts = contactsAll.filter((r) => inRange(r.blast_date, from, to));
  const SENT = ["Terkirim", "Dibaca", "Dibalas", "Tertarik", "Deal", "Tidak tertarik"];
  const RESPONDED = ["Dibalas", "Tertarik", "Deal", "Tidak tertarik"];
  const contactKpis = (rows: Row[]) => {
    const sent = rows.filter((r) => SENT.includes(String(r.status))).length;
    const responded = rows.filter((r) => RESPONDED.includes(String(r.status))).length;
    const interested = rows.filter((r) => r.status === "Tertarik" || r.status === "Deal").length;
    return {
      contacts: rows.length,
      ready: rows.filter((r) => lc(r.blast) !== "no").length,
      pending: rows.filter((r) => lc(r.blast) !== "no" && (!r.status || r.status === "Belum dikirim")).length,
      sent,
      responded,
      interested,
      deals: rows.filter((r) => r.status === "Deal").length,
      inactive: rows.filter((r) => r.status === "Nomor tidak aktif").length,
      responseRate: div(responded, sent),
      interestRate: div(interested, sent),
      potential: sum(rows.filter((r) => lc(r.blast) !== "no"), "official_rec") || sum(rows.filter((r) => lc(r.blast) !== "no"), "recommended"),
      interestedValue: sum(rows.filter((r) => r.status === "Tertarik" || r.status === "Deal"), "official_rec"),
    };
  };
  const contactsByBatch = [...groupBy(contacts, (r) => String(r.batch ?? "").trim()).entries()]
    .map(([name, rs]) => ({ name, ...contactKpis(rs), date: rs.map((r) => String(r.blast_date)).sort()[0] }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const contactsByUnit = [...groupBy(contacts, (r) => String(r.unit_type ?? "").trim()).entries()]
    .map(([name, rs]) => ({ name, ...contactKpis(rs) }))
    .sort((a, b) => b.contacts - a.contacts);
  const contactsByYear = [...groupBy(contacts, (r) => String(r.year ?? "").trim()).entries()]
    .map(([name, rs]) => ({ name, ...contactKpis(rs) }))
    .sort((a, b) => b.name.localeCompare(a.name));
  const contactStatus = countBy(contacts, "status");
  const leadPhones = new Set(leadsAll.concat(openLeads).map((r) => String(r.phone ?? "").replace(/\D/g, "").replace(/^62/, "0")));
  const notConverted = contacts.filter(
    (r) => (r.status === "Tertarik" || r.status === "Dibalas") && !leadPhones.has(String(r.phone ?? "").replace(/\D/g, "").replace(/^62/, "0")),
  );

  // ---- wallets: saldo awal bulan berikutnya = saldo akhir bulan lalu (dikurangi belanja iklan nyata)
  const walletMonth = monthStart(to);
  const addMonth = (m: string) => {
    const d = new Date(m + "T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + 1);
    return d.toISOString().slice(0, 10);
  };
  interface WalletMonth { kind: "ads" | "blast" | "influencer"; id: number | null; brand: string; platform: string; month: string; opening: number; topup: number; planned: number; available: number; spent: number; closing: number; carried: boolean; manual: boolean }
  const walletChains = new Map<string, Row[]>();
  for (const w of walletRows) {
    const k = `${w.brand}|${lc(w.platform)}`;
    if (!walletChains.has(k)) walletChains.set(k, []);
    walletChains.get(k)!.push(w);
  }
  const walletHistory: WalletMonth[] = [];
  for (const rows of walletChains.values()) {
    const byMonth = new Map(rows.map((w) => [String(w.period).slice(0, 7), w]));
    const first = rows.map((w) => monthStart(String(w.period).slice(0, 10))).sort()[0];
    let carry = 0;
    for (let m = first; m <= walletMonth; m = addMonth(m)) {
      const w = byMonth.get(m.slice(0, 7));
      const ref = w ?? rows[0];
      const wEnd = monthEnd(m) < effTo ? monthEnd(m) : effTo;
      const kind: WalletMonth["kind"] = /blast|whatsapp|wa/.test(lc(ref.platform)) ? "blast" : /influencer|kol|endorse/.test(lc(ref.platform)) ? "influencer" : "ads";
      const sameBrand = (r: Row) => !ref.brand || !r.brand || r.brand === ref.brand;
      const spent =
        kind === "blast"
          ? blastHistory.filter((r) => sameBrand(r) && inRange(r.blast_date, m, wEnd)).reduce((t, r) => t + n(r.cost), 0)
          : kind === "influencer"
            ? inflHistory.filter((r) => sameBrand(r) && inRange(r.post_date, m, wEnd)).reduce((t, r) => t + n(r.fee), 0)
            : adsHistory.filter((r) => r.brand === ref.brand && lc(r.platform) === lc(ref.platform)).reduce((sum2, r) => sum2 + spendIn(r, m, wEnd), 0);
      const isFirst = m === first;
      const opening = isFirst ? n(w?.opening_balance) : carry;
      const topup = n(w?.topup);
      const available = opening + topup;
      const closing = available - spent;
      walletHistory.push({ kind, id: w ? Number(w.id) : null, brand: String(ref.brand ?? ""), platform: String(ref.platform ?? ""), month: m, opening, topup, planned: n(w?.planned_topup), available, spent, closing, carried: !isFirst, manual: !!w });
      carry = closing;
    }
  }
  walletHistory.sort((x, y) => y.month.localeCompare(x.month) || x.brand.localeCompare(y.brand));
  const wallets = walletHistory
    .filter((w) => w.month.slice(0, 7) === walletMonth.slice(0, 7))
    .map((w) => {
      const elapsed = Math.max(1, diffDays(walletMonth, to < today ? to : today) + 1);
      const burn = w.spent / elapsed;
      const dl = burn > 0 && w.closing > 0 ? w.closing / burn : null;
      return { ...w, emptyOn: dl !== null && dl < 400 ? addDays(today, Math.floor(dl)) : null, burnPerDay: burn, daysLeft: burn > 0 && w.closing > 0 ? w.closing / burn : w.closing <= 0 ? 0 : null };
    });

  // ---- google business: snapshots (jumlah ulasan + rating per cabang) → perkembangan
  const statGroups = groupBy(statRows, (r) => `${r.brand ?? ""}|${r.branch ?? ""}`);
  const reviewGrowth = [...statGroups.entries()].map(([key, rs]) => {
    const sorted = [...rs].sort((x, y) => String(x.snapshot_date).localeCompare(String(y.snapshot_date)));
    const inWin = sorted.filter((r) => String(r.snapshot_date) <= to);
    const last = inWin[inWin.length - 1];
    const base = [...inWin].reverse().find((r) => String(r.snapshot_date) < from) ?? inWin[0];
    // reviews logged individually after the last snapshot are added on top
    const [bBrand, bBranch] = key.split("|");
    const extra = reviewsAll.filter((r) => String(r.brand ?? "") === bBrand && String(r.branch ?? "") === bBranch && last && String(r.review_date) > String(last.snapshot_date) && String(r.review_date) <= to).length;
    return {
      name: bBranch ? `${bBranch}${bBrand ? ` · ${bBrand}` : ""}` : bBrand || "(Kosong)",
      initial: n(sorted[0]?.total_reviews),
      initialDate: sorted[0]?.snapshot_date ?? null,
      start: n(base?.total_reviews),
      current: n(last?.total_reviews) + extra,
      growth: n(last?.total_reviews) + extra - n(base?.total_reviews),
      ratingStart: n(base?.avg_rating) || null,
      ratingNow: n(last?.avg_rating) || null,
      ratingChange: n(last?.avg_rating) && n(base?.avg_rating) ? n(last?.avg_rating) - n(base?.avg_rating) : null,
      snapshots: sorted.length,
    };
  });
  const reviewTrendMap = new Map<string, Record<string, number | string>>();
  for (const r of [...statRows].sort((x, y) => String(x.snapshot_date).localeCompare(String(y.snapshot_date)))) {
    const d = String(r.snapshot_date).slice(0, 10);
    if (d > to) continue;
    const name = r.branch ? String(r.branch) : String(r.brand ?? "Total");
    if (!reviewTrendMap.has(d)) reviewTrendMap.set(d, { date: d });
    reviewTrendMap.get(d)![name] = n(r.total_reviews);
    reviewTrendMap.get(d)![`${name}__rating`] = n(r.avg_rating);
  }
  const reviewTrend = [...reviewTrendMap.values()];
  const reviewTrendSeries = [...new Set(statRows.map((r) => (r.branch ? String(r.branch) : String(r.brand ?? "Total"))))];

  // ---- KPI progress (sum of targets for months in range)
  const kpiInRange = kpiRows.filter((k) => String(k.period).slice(0, 7) >= from.slice(0, 7) && String(k.period).slice(0, 7) <= to.slice(0, 7));
  const tsum = (k: string) => kpiInRange.reduce((s, r) => s + n(r[k]), 0);
  const tavg = (k: string) => {
    const xs = kpiInRange.filter((r) => n(r[k]) > 0);
    return xs.length ? xs.reduce((s, r) => s + n(r[k]), 0) / xs.length : 0;
  };
  const kpiProgress = [
    { metric: "Jumlah Posting", target: tsum("target_posts"), actual: kpis.content.posted, format: "number", higherBetter: true },
    { metric: "Engagement Rate", target: tavg("target_er"), actual: kpis.content.avgER ?? 0, format: "percent", higherBetter: true },
    { metric: "Leads", target: tsum("target_leads"), actual: kpis.leads.leads, format: "number", higherBetter: true },
    { metric: "Deal", target: tsum("target_deals"), actual: kpis.leads.deals, format: "number", higherBetter: true },
    { metric: "Omzet", target: tsum("target_revenue"), actual: totalRevenue, format: "money", higherBetter: true },
    { metric: "Budget Iklan Terpakai", target: tsum("ads_budget"), actual: kpis.ads.spend, format: "money", higherBetter: false },
    { metric: "Biaya per Lead", target: tavg("max_cpl"), actual: overall.cpl ?? 0, format: "money", higherBetter: false },
    { metric: "Rating Google", target: tavg("target_rating"), actual: kpis.reviews.avgRating ?? 0, format: "decimal", higherBetter: true },
  ]
    .filter((k) => k.target > 0)
    .map((k) => ({ ...k, pct: k.target ? k.actual / k.target : null }));

  // ---------------------------------------------------------------- insights
  const insights: Insight[] = [];
  const push = (i: Insight) => insights.push(i);
  const pctElapsed = Math.min(1, Math.max(0.03, (diffDays(from, today < to ? today : to) + 1) / len));

  // ADS
  const A = kpis.ads;
  if (!A.campaigns) {
    push({ level: "info", area: "Ads", title: "Belum ada data campaign di periode ini", detail: "Dashboard iklan kosong untuk filter yang dipilih.", action: "Input campaign di menu Ads Campaign atau impor dari Excel/Ads Manager export." });
  } else {
    if (A.ctr !== null) {
      if (A.ctr < 0.008)
        push({ level: "warning", area: "Ads", title: `CTR rendah (${fmtPct(A.ctr, 2)})`, detail: `Dari ${fmtNum(A.impressions)} impresi hanya ${fmtNum(A.clicks)} klik. Benchmark sehat untuk Meta/TikTok umumnya ≥ 1%.`, action: "Uji 2–3 variasi creative baru (hook kuat di 3 detik pertama, tampilkan harga/promo), perjelas CTA, dan persempit targeting ke audiens yang relevan." });
      else if (A.ctr >= 0.015)
        push({ level: "good", area: "Ads", title: `CTR bagus (${fmtPct(A.ctr, 2)})`, detail: "Creative & targeting sudah menarik perhatian audiens.", action: "Pertahankan angle creative yang sama, duplikasi ke audiens lookalike/serupa untuk scale." });
    }
    const fatigued = campaigns.filter((c) => (c.frequency ?? 0) > 3 && c.spend > 0);
    if (fatigued.length)
      push({ level: "warning", area: "Ads", title: `${fatigued.length} campaign berpotensi ad fatigue`, detail: `Frekuensi > 3: ${fatigued.slice(0, 3).map((c) => `${c.name} (${fmtNum(c.frequency, 1)}x)`).join(", ")}.`, action: "Ganti/refresh creative atau perluas audiens agar orang yang sama tidak melihat iklan berulang-ulang." });
    const noConv = campaigns.filter((c) => c.spend > 50000 && !c.conversations && /prospek|pesan|traffic|penjualan/i.test(String(c.objective ?? "")));
    if (noConv.length)
      push({ level: "critical", area: "Ads", title: `${noConv.length} campaign berbiaya tanpa percakapan/hasil`, detail: noConv.slice(0, 3).map((c) => `${c.name}: ${fmtMoney(c.spend)}`).join("; "), action: "Cek tombol/link WhatsApp, pastikan tujuan campaign = Pesan/Prospek, cek tracking. Jika tetap nol 3 hari, matikan dan pindahkan budget." });
    const withConv = campaigns.filter((c) => c.conversations >= 3 && c.costPerConv);
    if (withConv.length >= 2) {
      const sorted = [...withConv].sort((a, b) => (a.costPerConv ?? 0) - (b.costPerConv ?? 0));
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      if ((worst.costPerConv ?? 0) > (best.costPerConv ?? 0) * 1.5)
        push({ level: "info", area: "Ads", title: "Realokasi budget antar campaign", detail: `Campaign termurah: ${best.name} (${fmtMoney(best.costPerConv)}/percakapan). Termahal: ${worst.name} (${fmtMoney(worst.costPerConv)}/percakapan).`, action: `Naikkan budget "${best.name}" 20–30% bertahap dan turunkan/optimasi "${worst.name}".` });
    }
    if (A.revenue > 0 && A.roas !== null) {
      if (A.roas < 1) push({ level: "critical", area: "Ads", title: `ROAS di bawah 1 (${fmtNum(A.roas, 2)}x) — iklan rugi`, detail: `Omzet dari ads ${fmtMoney(A.revenue)} ÷ biaya ${fmtMoney(A.spend)}${roasFromLeads ? " (omzet dihitung dari deal WA Leads bersumber Ads)" : ""}.`, action: "Hentikan campaign ber-ROAS terendah, fokus ke produk/penawaran dengan margin tertinggi, perkuat follow-up leads agar closing naik." });
      else if (A.roas < 2) push({ level: "warning", area: "Ads", title: `ROAS tipis (${fmtNum(A.roas, 2)}x)`, detail: "Setelah HPP & operasional, margin dari iklan kemungkinan kecil.", action: "Optimasi offer (bundling/upsell), tingkatkan konversi chat→deal, dan pangkas campaign dengan biaya/percakapan tertinggi." });
      else if (A.roas >= 3) push({ level: "good", area: "Ads", title: `ROAS sehat (${fmtNum(A.roas, 2)}x)`, detail: `Setiap Rp 1 iklan menghasilkan Rp ${fmtNum(A.roas, 1)} omzet.`, action: "Scale budget campaign terbaik 20–30% per 3 hari sambil pantau biaya per percakapan." });
    } else if (A.spend > 0) {
      push({ level: "info", area: "Ads", title: "Omzet dari iklan belum diisi", detail: "ROAS/ROI tidak bisa dihitung tanpa data omzet per campaign.", action: "Isi kolom Omzet pada campaign (atau catat Nilai Deal di WA Leads dengan sumber Ads) agar efektivitas iklan terukur." });
    }
    if (byPlatform.length >= 2) {
      const pl = byPlatform.filter((x) => x.clicks > 0 && x.cpc);
      if (pl.length >= 2) {
        const s = [...pl].sort((a, b) => (a.cpc ?? 0) - (b.cpc ?? 0));
        push({ level: "info", area: "Ads", title: `Platform paling efisien: ${s[0].name}`, detail: s.map((x) => `${x.name} CPC ${fmtMoney(x.cpc)}`).join(" · "), action: `Prioritaskan budget traffic di ${s[0].name}; gunakan ${s[s.length - 1].name} untuk tujuan yang lebih spesifik (awareness/retargeting).` });
      }
    }
    const stale = campaigns.filter((c) => c.status === "Running" && c.end_date && String(c.end_date) < today);
    if (stale.length)
      push({ level: "warning", area: "Ads", title: `${stale.length} campaign status "Running" sudah lewat tanggal berakhir`, detail: stale.slice(0, 4).map((c) => c.name).join(", "), action: "Update status ke Done/Nonaktif agar laporan akurat, atau perpanjang tanggal jika masih berjalan." });
    const pa = prevKpis.ads;
    if (pa.spend > 0 && pa.costPerConv && A.costPerConv) {
      const ch = A.costPerConv / pa.costPerConv - 1;
      if (ch > 0.25) push({ level: "warning", area: "Ads", title: `Biaya per percakapan naik ${fmtPct(ch, 0)}`, detail: `${fmtMoney(pa.costPerConv)} → ${fmtMoney(A.costPerConv)} dibanding periode sebelumnya.`, action: "Cek creative yang sudah jenuh, audiens yang terlalu sempit, atau persaingan musiman; uji creative baru." });
      if (ch < -0.15) push({ level: "good", area: "Ads", title: `Biaya per percakapan turun ${fmtPct(-ch, 0)}`, detail: `${fmtMoney(pa.costPerConv)} → ${fmtMoney(A.costPerConv)}.`, action: "Dokumentasikan perubahan yang berhasil (creative/targeting) dan jadikan standar." });
    }
  }
  // BUDGET
  for (const w of wallets) {
    if (w.closing < 0)
      push({ level: "critical", area: "Budget", title: `Saldo ${w.brand} · ${w.platform} minus`, detail: `Terpakai ${fmtMoney(w.spent)} dari dana ${fmtMoney(w.available)}.`, action: "Cek ulang data top up / spend, dan lakukan top up agar iklan tidak berhenti." });
    else if (w.daysLeft !== null && w.daysLeft < 7)
      push({ level: "warning", area: "Budget", title: `Saldo ${w.brand} · ${w.platform} cukup ±${fmtNum(w.daysLeft, 0)} hari`, detail: `Sisa ${fmtMoney(w.closing)}, rata-rata belanja ${fmtMoney(w.burnPerDay)}/hari.`, action: w.planned ? `Jalankan rencana top up ${fmtMoney(w.planned)} sebelum saldo habis.` : "Siapkan top up agar campaign yang performanya bagus tidak terputus." });
  }
  const budgetKpi = kpiProgress.find((k) => k.metric === "Budget Iklan Terpakai");
  if (budgetKpi && budgetKpi.pct !== null) {
    if (budgetKpi.pct > pctElapsed + 0.15)
      push({ level: "warning", area: "Budget", title: `Pacing budget terlalu cepat (${fmtPct(budgetKpi.pct, 0)} terpakai)`, detail: `Waktu berjalan baru ${fmtPct(pctElapsed, 0)} dari periode. Budget ${fmtMoney(budgetKpi.target)}.`, action: "Turunkan budget harian campaign dengan hasil terendah agar budget cukup sampai akhir bulan." });
    else if (budgetKpi.pct < pctElapsed - 0.25)
      push({ level: "info", area: "Budget", title: `Budget iklan baru terpakai ${fmtPct(budgetKpi.pct, 0)}`, detail: `Waktu berjalan ${fmtPct(pctElapsed, 0)}. Ada ruang untuk menambah jangkauan.`, action: "Tambah budget pada campaign dengan biaya per percakapan terbaik atau aktifkan campaign yang direncanakan." });
  }

  // LEADS
  const L = kpis.leads;
  if (!L.leads) {
    push({ level: "info", area: "Leads", title: "Belum ada data leads WA di periode ini", detail: "Tanpa data leads, efektivitas ads/blast tidak bisa diukur sampai ke penjualan.", action: "Minta CS mencatat setiap chat masuk (tanggal, sumber trafik, segmen, status) di menu WA Leads setiap hari." });
  } else {
    if (L.dealRate !== null) {
      if (L.dealRate < 0.1) push({ level: "warning", area: "Leads", title: `Conversion rate leads → deal rendah (${fmtPct(L.dealRate)})`, detail: `${L.deals} deal dari ${L.leads} leads.`, action: "Perbaiki script CS (balas < 5 menit, tanyakan kebutuhan, kirim penawaran + urgensi/promo terbatas), dan disiplin follow up H+3, H+7, H+14." });
      else if (L.dealRate >= 0.25) push({ level: "good", area: "Leads", title: `Conversion rate leads sangat baik (${fmtPct(L.dealRate)})`, detail: `${L.deals} deal dari ${L.leads} leads.`, action: "Tambah volume leads (naikkan budget di sumber dengan CPL termurah) karena tim closing sudah efektif." });
    }
    if (L.ghostRate !== null && L.ghostRate > 0.3)
      push({ level: "warning", area: "Leads", title: `Ghosting tinggi (${fmtPct(L.ghostRate)})`, detail: `${L.ghost} leads berhenti merespons.`, action: "Kirim follow up bernilai (testimoni, promo terbatas, foto/video), gunakan pertanyaan tertutup, dan jadwalkan blast re-engagement untuk leads ghosting." });
    const hotOpen = followUps.filter((f) => lc(f.segment) === "hot");
    if (hotOpen.length)
      push({ level: "critical", area: "Leads", title: `${hotOpen.length} leads HOT menunggu follow up`, detail: hotOpen.slice(0, 5).map((f) => `${f.name} (${f.age} hari)`).join(", "), action: "Hubungi hari ini — leads HOT paling cepat dingin. Tawarkan DP/booking dengan bonus jika closing minggu ini." });
    if (followUps.length > hotOpen.length)
      push({ level: "warning", area: "Leads", title: `${followUps.length - hotOpen.length} leads WARM/COLD jatuh tempo follow up`, detail: "Berdasarkan jadwal FU1 (H+3), FU2 (H+7), FU3 (H+14).", action: "Buka menu WA Leads → filter 'Aksi Berikutnya' dan isi hasil follow up setelah menghubungi." });
    const srcGood = leadsBySource.filter((s) => s.leads >= 3 && s.name !== "(Kosong)");
    if (srcGood.length >= 2) {
      const bestQ = [...srcGood].sort((a, b) => (b.dealRate ?? 0) - (a.dealRate ?? 0))[0];
      push({ level: "info", area: "Leads", title: `Sumber leads berkualitas terbaik: ${bestQ.name}`, detail: srcGood.map((s) => `${s.name}: ${s.leads} leads, deal ${fmtPct(s.dealRate)}${s.cpl ? `, CPL ${fmtMoney(s.cpl)}` : ""}`).join(" · "), action: `Perbesar porsi ${bestQ.name}; evaluasi sumber dengan deal rate terendah (targeting/pesan iklan mungkin tidak sesuai).` });
      const junk = srcGood.filter((s) => s.leads >= 5 && s.deals === 0);
      if (junk.length) push({ level: "warning", area: "Leads", title: `Sumber dengan leads tapi 0 deal: ${junk.map((j) => j.name).join(", ")}`, detail: "Leads masuk namun tidak ada closing.", action: "Cek kualitas audiens & kesesuaian pesan iklan dengan penawaran; kualifikasi leads lebih awal." });
    }
    const unknownSrc = leads.filter((r) => !r.source).length;
    if (unknownSrc / L.leads > 0.2)
      push({ level: "info", area: "Leads", title: `${fmtPct(unknownSrc / L.leads, 0)} leads tanpa sumber trafik`, detail: "Atribusi iklan jadi tidak akurat.", action: "Wajibkan CS menanyakan 'tahu dari mana?' dan isi kolom Sumber Trafik." });
    const pl = prevKpis.leads;
    if (pl.leads > 0) {
      const ch = L.leads / pl.leads - 1;
      if (ch <= -0.2) push({ level: "warning", area: "Leads", title: `Leads turun ${fmtPct(-ch, 0)} vs periode lalu`, detail: `${pl.leads} → ${L.leads} leads.`, action: "Cek apakah ada campaign yang berhenti, saldo iklan habis, atau konten berkurang; aktifkan blast ke database lama." });
      if (ch >= 0.2) push({ level: "good", area: "Leads", title: `Leads naik ${fmtPct(ch, 0)} vs periode lalu`, detail: `${pl.leads} → ${L.leads} leads.`, action: "Pastikan kapasitas CS cukup agar respons tetap cepat." });
    }
  }
  if (overall.cpl !== null) {
    const maxCpl = kpiProgress.find((k) => k.metric === "Biaya per Lead");
    if (maxCpl && overall.cpl > maxCpl.target)
      push({ level: "warning", area: "Budget", title: `Biaya per lead ${fmtMoney(overall.cpl)} melebihi batas ${fmtMoney(maxCpl.target)}`, detail: `Total biaya marketing ${fmtMoney(totalCost)} untuk ${L.leads} leads.`, action: "Kurangi budget di sumber dengan CPL tertinggi dan perbanyak konten organik/blast yang biayanya rendah." });
  }

  // BLAST
  const B = kpis.blast;
  if (!B.blasts) {
    if (L.cold + L.warm > 10 || L.ghost > 5)
      push({ level: "info", area: "WA Blast", title: "Belum ada WA Blast di periode ini", detail: `Ada ${L.warm} WARM, ${L.cold} COLD, dan ${L.ghost} ghosting leads yang bisa di-reaktivasi.`, action: "Jadwalkan blast bersegmen (promo terbatas / info event) ke leads WARM, COLD & ghosting." });
  } else {
    if (B.deliveryRate !== null && B.deliveryRate < 0.9) push({ level: "warning", area: "WA Blast", title: `Delivery rate blast ${fmtPct(B.deliveryRate)}`, detail: `${fmtNum(B.sent - B.delivered)} pesan tidak terkirim.`, action: "Bersihkan database nomor (format 62…, hapus nomor tidak aktif), dan hindari volume besar sekaligus agar nomor tidak terblokir." });
    if (B.readRate !== null && B.readRate < 0.4) push({ level: "warning", area: "WA Blast", title: `Read rate blast rendah (${fmtPct(B.readRate)})`, detail: "Banyak pesan tidak dibuka.", action: "Kirim di jam aktif (11.00–13.00 / 19.00–21.00), personalisasi nama, dan buat kalimat pembuka yang memancing rasa penasaran." });
    if (B.replyRate !== null) {
      if (B.replyRate < 0.05) push({ level: "warning", area: "WA Blast", title: `Reply rate blast rendah (${fmtPct(B.replyRate)})`, detail: `${fmtNum(B.replied)} balasan dari ${fmtNum(B.delivered || B.sent)} pesan.`, action: "Gunakan CTA yang mudah dibalas (\"Balas 1 untuk info harga\"), sertakan gambar promo, dan segmentasi audiens." });
      else if (B.replyRate >= 0.15) push({ level: "good", area: "WA Blast", title: `Reply rate blast bagus (${fmtPct(B.replyRate)})`, detail: "Pesan relevan untuk audiens.", action: "Gunakan template pesan ini sebagai standar dan ulangi untuk segmen lain." });
    }
    if (blastList.length >= 2) {
      const best = [...blastList].sort((a, b) => (b.replyRate ?? 0) - (a.replyRate ?? 0))[0];
      push({ level: "info", area: "WA Blast", title: `Blast terbaik: ${best.name}`, detail: `Reply rate ${fmtPct(best.replyRate)}, ${best.leads} leads, ${best.deals} deal.`, action: "Pelajari angle pesan & waktu kirim blast ini lalu terapkan di blast berikutnya." });
    }
  }

  // CONTENT
  const C = kpis.content;
  if (!C.planned) {
    push({ level: "info", area: "Konten", title: "Belum ada rencana konten di periode ini", detail: "Konten organik adalah sumber leads termurah.", action: "Susun content plan minimal 3–4 posting/minggu dengan campuran pilar Edukasi, Promosi, Testimoni & Engagement." });
  } else {
    if (C.completionRate !== null && from <= today) {
      const due = content.filter((r) => String(r.post_date) <= today && r.status !== "Cancel").length;
      const doneDue = content.filter((r) => String(r.post_date) <= today && r.status === "Posted").length;
      const rate = div(doneDue, due);
      if (rate !== null && rate < 0.8)
        push({ level: "warning", area: "Konten", title: `Completion rate konten ${fmtPct(rate, 0)}`, detail: `${due - doneDue} konten yang jadwalnya sudah lewat belum berstatus Posted.`, action: "Cek bottleneck produksi (desain/review), buat bank konten H-7, dan update status setelah posting." });
      else if (rate !== null && rate >= 0.95) push({ level: "good", area: "Konten", title: `Konten konsisten (${fmtPct(rate, 0)} sesuai jadwal)`, detail: `${doneDue} dari ${due} konten terjadwal sudah tayang.`, action: "Pertahankan ritme; mulai eksperimen format baru (Reels/carousel edukasi)." });
    }
    if (C.onTimeRate !== null && C.onTimeRate < 0.8)
      push({ level: "info", area: "Konten", title: `On-time posting ${fmtPct(C.onTimeRate, 0)}`, detail: "Sebagian konten tayang setelah tanggal rencana.", action: "Gunakan fitur jadwal (Meta Business Suite/TikTok scheduler) agar posting tepat waktu." });
    if (C.avgER !== null) {
      if (C.avgER < 0.01) push({ level: "warning", area: "Konten", title: `Engagement rate rata-rata rendah (${fmtPct(C.avgER, 2)})`, detail: "ER dihitung (Like + Comment + Saved) / Followers.", action: "Perbanyak konten interaktif (pertanyaan, polling, giveaway kecil), hook visual kuat, dan balas setiap komentar di 1 jam pertama." });
      else if (C.avgER >= 0.03) push({ level: "good", area: "Konten", title: `Engagement rate bagus (${fmtPct(C.avgER, 2)})`, detail: "Audiens aktif berinteraksi dengan konten.", action: "Boost konten dengan ER tertinggi sebagai iklan (dark post/Spark Ads) — biasanya CPC lebih murah." });
    }
    const pillars = contentByPillar.filter((p) => p.avgER !== null && p.posted >= 2);
    if (pillars.length >= 2) {
      const s = [...pillars].sort((a, b) => (b.avgER ?? 0) - (a.avgER ?? 0));
      push({ level: "info", area: "Konten", title: `Pilar konten terbaik: ${s[0].name}`, detail: s.map((p) => `${p.name} ER ${fmtPct(p.avgER, 2)}`).join(" · "), action: `Tambah porsi pilar ${s[0].name}; evaluasi format pilar ${s[s.length - 1].name}.` });
    }
    const wd = weekdayStats.filter((w) => w.avgER !== null && w.posts >= 2);
    if (wd.length >= 3) {
      const best = [...wd].sort((a, b) => (b.avgER ?? 0) - (a.avgER ?? 0))[0];
      push({ level: "info", area: "Konten", title: `Hari posting terbaik: ${best.name}`, detail: `Rata-rata ER ${fmtPct(best.avgER, 2)} dari ${best.posts} posting.`, action: `Jadwalkan konten utama (promo/launching) di hari ${best.name}.` });
    }
    if (topContent[0]) push({ level: "good", area: "Konten", title: `Konten terbaik: "${topContent[0].title}"`, detail: `ER ${fmtPct(topContent[0].er, 2)} · ${topContent[0].channel ?? ""}`, action: "Buat versi lanjutan (part 2) atau repurpose ke channel lain, dan pertimbangkan untuk di-boost." });
  }
  if (!upcomingContent.length)
    push({ level: "warning", area: "Konten", title: "Tidak ada konten terjadwal 7 hari ke depan", detail: "Kalender konten minggu depan masih kosong.", action: "Isi content plan minggu depan sekarang agar produksi punya waktu." });

  // REPUTATION
  const R = kpis.reviews;
  if (R.reviews) {
    if (R.avgRating !== null && R.avgRating < 4) push({ level: "critical", area: "Reputasi", title: `Rating Google rata-rata ${fmtNum(R.avgRating, 2)}★`, detail: `${R.negative} ulasan negatif dari ${R.reviews}.`, action: "Tangani akar masalah dari kategori keluhan teratas, balas semua ulasan negatif dengan solusi, dan minta pelanggan puas memberi ulasan." });
    else if (R.avgRating !== null && R.avgRating < 4.5) push({ level: "warning", area: "Reputasi", title: `Rating Google ${fmtNum(R.avgRating, 2)}★ — bisa ditingkatkan`, detail: `${R.negative} ulasan negatif.`, action: "Buat program minta ulasan (QR code di kasir/struk) untuk pelanggan yang puas." });
    else if (R.avgRating !== null) push({ level: "good", area: "Reputasi", title: `Rating Google sangat baik (${fmtNum(R.avgRating, 2)}★)`, detail: `${R.reviews} ulasan di periode ini.`, action: "Gunakan ulasan terbaik sebagai konten testimoni di sosial media & iklan." });
    if (R.responseRate !== null && R.responseRate < 0.8) push({ level: "warning", area: "Reputasi", title: `Response rate ulasan ${fmtPct(R.responseRate, 0)}`, detail: "Ulasan yang tidak dibalas menurunkan kepercayaan calon pelanggan.", action: "Balas semua ulasan maksimal 24 jam; siapkan template balasan positif & negatif." });
    if (negativeCategories[0] && negativeCategories[0].value >= 2) push({ level: "warning", area: "Reputasi", title: `Keluhan terbanyak: ${negativeCategories[0].name}`, detail: `${negativeCategories[0].value} ulasan negatif di kategori ini.`, action: "Koordinasikan dengan tim operasional untuk perbaikan SOP pada area ini." });
    const branches = reviewsByBranch.filter((b) => b.reviews >= 3 && b.avgRating !== null);
    if (branches.length >= 2) {
      const worst = [...branches].sort((a, b) => (a.avgRating ?? 0) - (b.avgRating ?? 0))[0];
      if ((worst.avgRating ?? 5) < 4.5) push({ level: "info", area: "Reputasi", title: `Cabang dengan rating terendah: ${worst.name}`, detail: `${fmtNum(worst.avgRating, 2)}★ dari ${worst.reviews} ulasan.`, action: `Lakukan audit layanan di cabang ${worst.name}.` });
    }
  }
  const unansweredNeg = unanswered.filter((u) => u.rating > 0 && u.rating <= 3);
  if (unansweredNeg.length) push({ level: "critical", area: "Reputasi", title: `${unansweredNeg.length} ulasan negatif belum dibalas`, detail: unansweredNeg.slice(0, 3).map((u) => `${u.reviewer ?? "Anonim"} (${u.rating}★)`).join(", "), action: "Balas hari ini dengan permintaan maaf + solusi + ajakan menghubungi CS." });

  // ATRIBUSI
  const tagged = leads.filter((r) => r.campaign_ref).length;
  if (kpis.ads.spend > 0 && L.leads >= 10 && tagged / L.leads < 0.3)
    push({ level: "info", area: "Leads", title: `Hanya ${fmtPct(tagged / L.leads, 0)} leads punya kode campaign`, detail: "Tanpa kode, biaya per lead & ROAS per campaign tidak bisa dihitung akurat.", action: "Pakai Pembuat Link WA di halaman WA Leads: link iklan membawa kode campaign, lalu CS menyalinnya ke kolom Kode Campaign." });
  const attrOk = attribution.filter((a) => a.spend && a.leads >= 3);
  if (attrOk.length >= 2) {
    const byCpl = [...attrOk].filter((a) => a.cpl).sort((a, b) => (a.cpl ?? 0) - (b.cpl ?? 0));
    if (byCpl.length >= 2)
      push({ level: "info", area: "Ads", title: `Campaign dengan biaya per lead terbaik: ${byCpl[0].ref}`, detail: `${fmtMoney(byCpl[0].cpl)}/lead (${byCpl[0].leads} leads) vs ${byCpl[byCpl.length - 1].ref} ${fmtMoney(byCpl[byCpl.length - 1].cpl)}/lead.`, action: `Pindahkan sebagian budget dari "${byCpl[byCpl.length - 1].ref}" ke "${byCpl[0].ref}".` });
  }
  const silent = campaigns.filter((c) => c.spend > 300000 && c.attrLeads === 0 && attribution.length > 0);
  if (silent.length)
    push({ level: "warning", area: "Ads", title: `${silent.length} campaign berbelanja tapi tanpa lead bertanda kode`, detail: silent.slice(0, 3).map((c) => `${c.name} (${fmtMoney(c.spend)})`).join(", "), action: "Cek apakah link WA iklan membawa kode campaign dan CS mengisinya; jika tetap nol, campaign ini kemungkinan tidak efektif." });

  // BLAST CONTACTS
  const K = contactKpis(contacts);
  if (K.contacts) {
    if (K.pending && contacts.some((r) => String(r.blast_date) <= today && (!r.status || r.status === "Belum dikirim")))
      push({ level: "warning", area: "WA Blast", title: `${K.pending} kontak blast belum dikirim / belum diupdate`, detail: `Dari ${K.ready} kontak yang ditandai blast = yes.`, action: "Kirim blast lalu update status (Terkirim/Dibaca/Dibalas/Tertarik) agar respon per batch & tipe unit terukur." });
    if (notConverted.length)
      push({ level: "critical", area: "WA Blast", title: `${notConverted.length} kontak membalas/tertarik belum masuk WA Leads`, detail: notConverted.slice(0, 4).map((r) => `${r.name} (${r.unit_type ?? "-"})`).join(", "), action: "Pilih kontak tersebut di tab Kontak Blast lalu klik 'Jadikan Leads' agar langsung masuk antrian follow up." });
    if (K.sent >= 20 && K.inactive / K.sent > 0.1)
      push({ level: "warning", area: "WA Blast", title: `${fmtPct(K.inactive / K.sent, 0)} nomor tidak aktif`, detail: `${K.inactive} dari ${K.sent} kontak terkirim.`, action: "Perbarui nomor dari data kontrak terbaru (nomor resmi 62…), atau minta update nomor saat konsumen datang ke kantor." });
    const units = contactsByUnit.filter((u) => u.sent >= 10 && u.name);
    if (units.length >= 2) {
      const best = [...units].sort((a, b) => (b.interestRate ?? 0) - (a.interestRate ?? 0))[0];
      push({ level: "info", area: "WA Blast", title: `Tipe unit paling responsif: ${best.name}`, detail: units.slice(0, 5).map((u) => `${u.name} ${fmtPct(u.interestRate, 0)} tertarik`).join(" · "), action: `Prioritaskan blast & iklan fasilitas dana untuk pemilik ${best.name}; uji pesan berbeda untuk tipe dengan respon rendah.` });
    }
    if (K.interestRate !== null && K.sent >= 20) {
      if (K.interestRate < 0.03) push({ level: "warning", area: "WA Blast", title: `Minat dari blast kontak rendah (${fmtPct(K.interestRate, 1)})`, detail: `${K.interested} tertarik dari ${K.sent} terkirim.`, action: "Sebut nama & tipe unit konsumen, tampilkan nominal rekomendasi plafon (mis. 'cair s/d Rp 16,5 jt'), dan beri CTA balas 'YA'." });
      else if (K.interestRate >= 0.08) push({ level: "good", area: "WA Blast", title: `Blast kontak efektif (${fmtPct(K.interestRate, 1)} tertarik)`, detail: `Potensi pembiayaan dari yang tertarik ${fmtMoney(K.interestedValue)}.`, action: "Ulangi format pesan ini untuk batch berikutnya dan follow up yang tertarik dalam 1×24 jam." });
    }
  }

  // INFLUENCER
  const I = kpis.influencer;
  if (I.collabs) {
    const losers = influencerList.filter((x) => x.roi !== null && x.roi < 0);
    const winners = influencerList.filter((x) => x.roi !== null && x.roi >= 1);
    if (winners.length) push({ level: "good", area: "Influencer", title: `Influencer dengan ROI terbaik: ${winners[0].name}`, detail: `ROI ${fmtPct(winners[0].roi, 0)}, ${winners[0].leads} leads.`, action: "Lanjutkan kerjasama jangka panjang (paket bulanan/ambassador) dengan harga lebih efisien." });
    if (losers.length) push({ level: "warning", area: "Influencer", title: `${losers.length} kerjasama influencer belum balik modal`, detail: losers.slice(0, 3).map((l) => `${l.name} (ROI ${fmtPct(l.roi, 0)})`).join(", "), action: "Evaluasi kecocokan audiens influencer; beralih ke micro-influencer lokal dengan skema barter/affiliate." });
    if (I.fee > 0 && !I.revenue && !I.leads) push({ level: "info", area: "Influencer", title: "Hasil influencer belum terukur", detail: `Fee ${fmtMoney(I.fee)} tanpa data leads/omzet.`, action: "Gunakan kode promo unik / link WA khusus per influencer untuk tracking." });
  }

  // GENERAL
  const sla = financing.sla;
  if (sla.measured >= 5 && sla.avg !== null && sla.avg > 15)
    push({ level: sla.avg > 60 ? "critical" : "warning", area: "Leads", title: `Respons chat pertama lambat: rata-rata ${Math.round(sla.avg)} menit`, detail: `${Math.round((sla.within5 ?? 0) * 100)}% dibalas dalam 5 menit; ${sla.over60} lead menunggu lebih dari 1 jam.`, action: "Atur jadwal piket CS dan balasan otomatis di luar jam kerja. Lead yang dibalas dalam 5 menit jauh lebih mungkin lanjut survei." });
  if (financing.tracked && financing.funnel[1].value >= 5) {
    const [, survey, approve, akad] = financing.funnel;
    if (approve.value && akad.value / approve.value < 0.5)
      push({ level: "warning", area: "Leads", title: `Hanya ${Math.round((akad.value / approve.value) * 100)}% yang sudah approve berlanjut ke akad`, detail: `${approve.value} approve, ${akad.value} akad.`, action: "Hubungi nasabah yang sudah approve tapi belum akad: cek hambatan jadwal, dokumen, atau perubahan keputusan." });
    else if (survey.value && approve.value / survey.value < 0.4)
      push({ level: "info", area: "Leads", title: `Hanya ${Math.round((approve.value / survey.value) * 100)}% hasil survei yang approve`, detail: `${survey.value} survei, ${approve.value} approve.`, action: "Perketat penyaringan lead sebelum survei (plafon, jenis unit, kelengkapan dokumen) agar waktu tim survei tidak terbuang." });
  }
  const noBudget = events.filter((e) => !n(e.planned_budget) && String(e.event_date) <= addDays(today, 14));
  if (noBudget.length)
    push({ level: "warning", area: "Budget", title: `${noBudget.length} event dalam 14 hari belum punya rencana budget`, detail: noBudget.slice(0, 4).map((e) => `${e.title} (${e.event_date})`).join(", "), action: "Isi rencana budget iklan & target leads di Kalender Promo agar belanja iklan dan blast terarah dan saldo cukup." });
  const lateBlasts = blastHistory.filter((b) => (!b.status || b.status === "Draft" || b.status === "Terjadwal") && String(b.blast_date) < today && String(b.blast_date) >= addDays(today, -30));
  if (lateBlasts.length)
    push({ level: "warning", area: "WA Blast", title: `${lateBlasts.length} blast terjadwal sudah lewat tanggal tapi belum ditandai terkirim`, detail: lateBlasts.slice(0, 3).map((b) => `${b.campaign_name} (${b.blast_date})`).join(", "), action: "Buka Jadwal Broadcast: tandai Terkirim dan isi hasilnya, atau jadwalkan ulang. Biaya blast ikut memotong saldo bila Sumber Dana-nya WhatsApp Blast." });
  if (events.length)
    push({ level: "info", area: "Umum", title: `${events.length} event/tanggal penting dalam 30 hari`, detail: events.slice(0, 4).map((e) => `${e.title} (${e.event_date})`).join(", "), action: "Siapkan konten teaser H-7, campaign iklan H-5, dan blast H-2 untuk setiap event." });
  const paidLeads = leads.filter((r) => /ads|iklan/i.test(String(r.source ?? ""))).length;
  if (L.leads >= 10) {
    const share = paidLeads / L.leads;
    if (share > 0.8) push({ level: "info", area: "Umum", title: `${fmtPct(share, 0)} leads bergantung pada iklan`, detail: "Ketergantungan tinggi pada iklan berbayar membuat biaya akuisisi rentan naik.", action: "Perkuat kanal organik: konten rutin, Google Business, program referral & repeat order." });
  }

  const order: Record<Level, number> = { critical: 0, warning: 1, info: 2, good: 3 };
  insights.sort((a, b) => order[a.level] - order[b.level]);

  // ---- health scores (0-100)
  const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));
  const scoreAds = A.campaigns
    ? clamp(50 + ((A.ctr ?? 0.01) - 0.01) * 2500 + (A.roas ? (A.roas - 2) * 10 : 0) - fatiguedCount(campaigns) * 5)
    : null;
  const scoreLeads = L.leads ? clamp((L.dealRate ?? 0) * 250 + 40 - (L.ghostRate ?? 0) * 60 - Math.min(30, followUps.length * 2)) : null;
  const scoreContent = C.planned ? clamp((C.completionRate ?? 0) * 60 + Math.min(40, (C.avgER ?? 0) * 1000)) : null;
  const scoreRep = R.reviews ? clamp(((R.avgRating ?? 0) / 5) * 70 + (R.responseRate ?? 0) * 30) : null;
  const parts = [scoreAds, scoreLeads, scoreContent, scoreRep].filter((x): x is number => x !== null);
  const scores = { ads: scoreAds, leads: scoreLeads, content: scoreContent, reputation: scoreRep, overall: parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null };

  return {
    period: { from, to, prevFrom, prevTo, days: len },
    brand,
    kpis,
    prevKpis,
    overall,
    scores,
    trend,
    byPlatform,
    byBrand,
    byObjective,
    campaigns,
    leadsBySource,
    attribution,
    leadSegments,
    leadFinal,
    leadsByBrand,
    followUps: followUps.slice(0, 50),
    funnel,
    financing,
    contentByChannel,
    contentByPillar,
    contentByType,
    contentStatus,
    topContent,
    bottomContent,
    weekdayStats,
    followerGrowth,
    reviewsByBranch,
    ratingDist,
    reviewCategories,
    unanswered,
    blastList,
    blastFunnel,
    contactKpis: contactKpis(contacts),
    contactsByBatch,
    contactsByUnit,
    contactsByYear,
    contactStatus,
    notConverted: notConverted.slice(0, 50).map((r) => ({ id: r.id, name: r.name, phone: r.phone, unit_type: r.unit_type, status: r.status })),
    influencerList,
    wallets,
    walletHistory,
    roasFromLeads,
    reviewGrowth,
    reviewTrend,
    reviewTrendSeries,
    kpiProgress,
    events: [...events].sort((x, y) => String(x.event_date).localeCompare(String(y.event_date))),
    upcomingContent: [...upcomingContent].sort((x, y) => String(x.post_date).localeCompare(String(y.post_date))).map((c) => ({ id: c.id, title: c.title, post_date: c.post_date, channel: c.channel, status: c.status, brand: c.brand })),
    insights,
  };
}

function fatiguedCount(c: { frequency: number | null; spend: number }[]) {
  return c.filter((x) => (x.frequency ?? 0) > 3 && x.spend > 0).length;
}

export type Analytics = Awaited<ReturnType<typeof buildAnalytics>>;
