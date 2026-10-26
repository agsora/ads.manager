import { fmtMoney, fmtNum, fmtPct } from "./format";
import type { Analytics } from "./analytics";

export interface Fact {
  text: string;
  href?: string;
}

export type Verdict = "Naikkan" | "Pertahankan" | "Evaluasi" | "Hentikan?";
export interface CampaignRow {
  name: string;
  spend: number;
  share: number;
  conversations: number;
  costPerConv: number | null;
  verdict: Verdict;
}

const chg = (cur: number | null | undefined, prev: number | null | undefined) => (cur !== null && cur !== undefined && prev ? cur / prev - 1 : null);

/**
 * Campaign efficiency for budget decisions: each campaign's cost per conversation against the average of all of them.
 * Cheaper than 80% of the average earns more budget; more than 125% is questioned; no conversations at all is a stop signal.
 */
export function campaignBoard(a: Analytics): { rows: CampaignRow[]; avg: number | null; gapPct: number | null } {
  const list = a.campaigns.filter((c) => c.spend > 0);
  const totalSpend = list.reduce((t, c) => t + c.spend, 0);
  const totalConv = list.reduce((t, c) => t + c.conversations, 0);
  const avg = totalConv ? totalSpend / totalConv : null;
  const rows: CampaignRow[] = list
    .map((c) => {
      const cost = c.conversations ? c.spend / c.conversations : null;
      const material = c.spend >= totalSpend * 0.05 || c.spend >= 100000; // ignore crumbs
      let verdict: Verdict = "Pertahankan";
      if (!c.conversations) verdict = material ? "Hentikan?" : "Evaluasi";
      else if (avg && cost !== null && material && list.length >= 2) verdict = cost < avg * 0.8 ? "Naikkan" : cost > avg * 1.25 ? "Evaluasi" : "Pertahankan";
      return { name: c.name, spend: c.spend, share: totalSpend ? c.spend / totalSpend : 0, conversations: c.conversations, costPerConv: cost, verdict };
    })
    .sort((x, y) => y.spend - x.spend);
  const priced = rows.filter((r) => r.costPerConv !== null && r.spend >= totalSpend * 0.05);
  const best = [...priced].sort((x, y) => (x.costPerConv ?? 0) - (y.costPerConv ?? 0))[0];
  const worst = [...priced].sort((x, y) => (y.costPerConv ?? 0) - (x.costPerConv ?? 0))[0];
  const gapPct = best && worst && best !== worst && best.costPerConv ? (worst.costPerConv ?? 0) / best.costPerConv - 1 : null;
  return { rows, avg, gapPct };
}

/** Plain-language read of the period for an owner: what is going well, what needs watching, what to decide next. */
export function execSummary(a: Analytics) {
  const k = a.kpis;
  const p = a.prevKpis;
  const good: Fact[] = [];
  const watch: Fact[] = [];
  const decide: Fact[] = [];

  // ---- ads
  if (k.ads.conversations && k.ads.costPerConv) {
    const c = chg(k.ads.costPerConv, p.ads.costPerConv);
    if (c !== null && c <= -0.05) good.push({ text: `Biaya per percakapan turun ${fmtPct(-c, 0)} menjadi ${fmtMoney(k.ads.costPerConv)}`, href: "/ads" });
    if (c !== null && c >= 0.1) watch.push({ text: `Biaya per percakapan naik ${fmtPct(c, 0)} menjadi ${fmtMoney(k.ads.costPerConv)}`, href: "/ads" });
    const v = chg(k.ads.conversations, p.ads.conversations);
    if (v !== null && v >= 0.1) good.push({ text: `Percakapan dari iklan naik ${fmtPct(v, 0)} menjadi ${fmtNum(k.ads.conversations)}`, href: "/ads" });
    if (v !== null && v <= -0.15) watch.push({ text: `Percakapan dari iklan turun ${fmtPct(-v, 0)} menjadi ${fmtNum(k.ads.conversations)}`, href: "/ads" });
  }
  if (k.ads.ctr !== null && k.ads.impressions > 5000 && k.ads.ctr < 0.01) watch.push({ text: `CTR iklan ${fmtPct(k.ads.ctr, 2)}, di bawah patokan 1%: tampilan iklan kurang menarik`, href: "/creatives" });

  const board = campaignBoard(a);
  const up = board.rows.filter((r) => r.verdict === "Naikkan");
  const down = board.rows.filter((r) => r.verdict === "Evaluasi" || r.verdict === "Hentikan?");
  if (up[0]) good.push({ text: `Campaign paling hemat: ${up[0].name} (${fmtMoney(up[0].costPerConv)} per percakapan)`, href: "/ads" });
  if (up[0] && down[0] && board.gapPct !== null && board.gapPct >= 0.4)
    decide.push({ text: `Geser sebagian budget dari “${down[0].name}” ke “${up[0].name}”: biayanya ${fmtPct(board.gapPct, 0)} lebih mahal per percakapan`, href: "/ads" });
  else if (down[0] && down[0].verdict === "Hentikan?") decide.push({ text: `Tinjau campaign “${down[0].name}”: sudah menghabiskan ${fmtMoney(down[0].spend)} tanpa percakapan`, href: "/ads" });

  // ---- leads and financing
  if (k.leads.leads) {
    const v = chg(k.leads.leads, p.leads.leads);
    if (v !== null && v >= 0.1) good.push({ text: `Leads WhatsApp naik ${fmtPct(v, 0)} menjadi ${fmtNum(k.leads.leads)}`, href: "/leads" });
    if (v !== null && v <= -0.15) watch.push({ text: `Leads WhatsApp turun ${fmtPct(-v, 0)} menjadi ${fmtNum(k.leads.leads)}`, href: "/leads" });
  }
  const f = a.financing;
  if (f.tracked && f.funnel[0].value >= 5) {
    const akad = f.funnel[3].value;
    if (akad) good.push({ text: `${fmtNum(akad)} akad dengan biaya ${fmtMoney(f.costPerAkad)} per akad`, href: "/funnel" });
    const steps = f.funnel.slice(1).map((s, i) => ({ from: f.funnel[i].name, to: s.name, rate: f.funnel[i].value ? s.value / f.funnel[i].value : null, base: f.funnel[i].value }));
    const leak = steps.filter((s) => s.rate !== null && s.base >= 5).sort((x, y) => (x.rate ?? 1) - (y.rate ?? 1))[0];
    if (leak && (leak.rate ?? 1) < 0.6) {
      watch.push({ text: `Titik bocor: dari ${leak.from} ke ${leak.to} hanya ${fmtPct(leak.rate, 0)} yang lanjut`, href: "/funnel" });
      decide.push({ text: `Fokus perbaiki tahap ${leak.from} → ${leak.to} sebelum menambah budget iklan`, href: "/funnel" });
    }
  }
  const branches = f.byBranch.filter((b) => b.leads >= 3 && !b.name.startsWith("("));
  if (branches.length >= 2) {
    const sorted = [...branches].sort((x, y) => (y.akadRate ?? 0) - (x.akadRate ?? 0));
    const top = sorted[0];
    const low = sorted[sorted.length - 1];
    if ((top.akadRate ?? 0) > 0) good.push({ text: `Cabang ${top.name} paling efektif: ${fmtPct(top.akadRate, 0)} lead jadi akad`, href: "/performance" });
    if ((top.akadRate ?? 0) - (low.akadRate ?? 0) >= 0.15) decide.push({ text: `Pelajari cara kerja ${top.name} dan terapkan di ${low.name} (${fmtPct(low.akadRate, 0)} jadi akad)`, href: "/performance" });
  }
  if (f.sla.measured >= 5 && f.sla.avg !== null && f.sla.avg > 15) watch.push({ text: `Chat pertama dibalas rata-rata ${Math.round(f.sla.avg)} menit; ${f.sla.over60} menunggu lebih dari 1 jam`, href: "/performance" });

  // ---- reputation, budget, hygiene
  if (a.reviewSummary.ratingNow && a.reviewSummary.totalNow) {
    const r = a.reviewSummary.ratingNow;
    if (r >= 4.5) good.push({ text: `Rating Google ${r.toFixed(1)}★ dari ${fmtNum(a.reviewSummary.totalNow)} ulasan`, href: "/reviews" });
    else if (r < 4.2) watch.push({ text: `Rating Google ${r.toFixed(1)}★, di bawah target 4,5★`, href: "/reviews" });
  }
  const lowWallet = a.wallets.find((w) => w.closing < 0 || (w.daysLeft !== null && w.daysLeft < 7));
  if (lowWallet) watch.push({ text: `Saldo ${lowWallet.platform} ${lowWallet.brand} cukup ${lowWallet.closing < 0 ? "tidak" : `±${fmtNum(lowWallet.daysLeft ?? 0, 0)} hari`}: segera top up`, href: "/ads/budget" });
  if (a.unanswered.length >= 3) watch.push({ text: `${a.unanswered.length} ulasan belum dibalas`, href: "/reviews" });

  // ---- fill from the rule insights so no column is empty when data is thin
  const fill = (list: Fact[], levels: string[], max: number) => {
    for (const i of a.insights.filter((x) => levels.includes(x.level))) {
      if (list.length >= max) break;
      if (!list.some((f2) => f2.text === i.title)) list.push({ text: i.title, href: undefined });
    }
  };
  fill(good, ["good"], 3);
  fill(watch, ["critical", "warning"], 3);
  const acts = a.insights.filter((i) => i.level === "critical" || i.level === "warning" || i.level === "info");
  for (const i of acts) {
    if (decide.length >= 3) break;
    if (!decide.some((d) => d.text === i.action)) decide.push({ text: i.action });
  }

  // ---- one-line verdict
  const parts = [
    ["Iklan", a.scores.ads],
    ["Leads & akad", a.scores.leads],
    ["Konten", a.scores.content],
    ["Reputasi", a.scores.reputation],
  ].filter((x): x is [string, number] => typeof x[1] === "number");
  const best = [...parts].sort((x, y) => y[1] - x[1])[0];
  const weak = [...parts].sort((x, y) => x[1] - y[1])[0];
  const headline = parts.length >= 2 && best[0] !== weak[0] ? `Terkuat di ${best[0]} (${best[1]}), paling perlu dibenahi di ${weak[0]} (${weak[1]}).` : parts.length === 1 ? `Baru ${parts[0][0]} yang punya data (${parts[0][1]}); lengkapi area lain agar gambaran utuh.` : "Isi data agar kesehatan marketing bisa dinilai.";

  return { good: good.slice(0, 3), watch: watch.slice(0, 3), decide: decide.slice(0, 3), headline };
}
