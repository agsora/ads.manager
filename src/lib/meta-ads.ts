import { getSetting, q, setSetting } from "./db";
import { addDays, todayISO } from "./format";

const API = "https://graph.facebook.com/v21.0";

export interface MetaAdAccount {
  account: string; // act_123…
  brand: string;
}

const key = (orgId: number) => `meta_ads:${orgId}`;
const syncKey = (orgId: number) => `meta_ads_sync:${orgId}`;

export const normAccount = (s: string) => {
  const d = s.replace(/[^0-9]/g, "");
  return d ? `act_${d}` : "";
};

export async function metaAccounts(orgId: number): Promise<MetaAdAccount[]> {
  try {
    const v = JSON.parse((await getSetting(key(orgId))) ?? "[]");
    return Array.isArray(v) ? v.filter((a) => a?.account && a?.brand) : [];
  } catch {
    return [];
  }
}

export async function saveMetaAccounts(orgId: number, list: MetaAdAccount[]) {
  const clean = list.map((a) => ({ account: normAccount(String(a.account)), brand: String(a.brand ?? "").trim() })).filter((a) => a.account && a.brand);
  await setSetting(key(orgId), JSON.stringify(clean));
  return clean;
}

export const metaLastSync = (orgId: number) => getSetting(syncKey(orgId));

/** Tokens that may carry ads_read: META_ADS_TOKEN first, then the Facebook-type Instagram tokens (those not starting with IG). */
function tokens() {
  const env = process.env;
  const list = [env.META_ADS_TOKEN, env.IG_ACCESS_TOKEN, ...Object.keys(env).filter((k) => /^IG_ACCESS_TOKEN_.+/.test(k)).map((k) => env[k])].filter((t): t is string => !!t && !/^IG/.test(t));
  return [...new Set(list)];
}

type Page<T> = { data?: T[]; paging?: { next?: string }; error?: { message: string } };

async function getAll<T>(url: string, max = 20): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = url;
  for (let i = 0; i < max && next; i++) {
    const j: Page<T> = await (await fetch(next, { signal: AbortSignal.timeout(25000) })).json();
    if (j.error) throw new Error(j.error.message);
    out.push(...(j.data ?? []));
    next = j.paging?.next ?? null;
  }
  return out;
}

interface Insight {
  campaign_id: string;
  campaign_name: string;
  date_start: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  inline_link_clicks?: string;
  views?: string;
  actions?: { action_type: string; value: string }[];
}
interface Campaign {
  id: string;
  name: string;
  daily_budget?: string;
  lifetime_budget?: string;
  effective_status?: string;
}

const BASE_FIELDS = "campaign_id,campaign_name,spend,impressions,reach,inline_link_clicks,actions";
const num = (v?: string) => (v === undefined || v === "" ? 0 : Number(v) || 0);
const MSG = /messaging_conversation_started/;

async function pull(account: string, token: string, since: string, until: string) {
  const range = encodeURIComponent(JSON.stringify({ since, until }));
  const insightsUrl = (fields: string) => `${API}/${account}/insights?level=campaign&time_increment=1&time_range=${range}&fields=${fields}&limit=500&access_token=${token}`;
  let withViews = true;
  let insights: Insight[];
  try {
    insights = await getAll<Insight>(insightsUrl(`${BASE_FIELDS},views`));
  } catch {
    withViews = false;
    insights = await getAll<Insight>(insightsUrl(BASE_FIELDS));
  }
  const campaigns = await getAll<Campaign>(`${API}/${account}/campaigns?fields=id,name,daily_budget,lifetime_budget,effective_status&limit=200&access_token=${token}`);
  return { insights, campaigns, withViews };
}

/**
 * Reads daily campaign figures from Meta Ads and writes them into Ads Campaign, one row per campaign per day.
 * Existing rows of the same brand/campaign/day are updated; revenue, notes and other hand-entered columns are never touched.
 */
export async function syncMetaAds(orgId: number, days = 7) {
  const accounts = await metaAccounts(orgId);
  if (!accounts.length) return { rows: 0, inserted: 0, updated: 0, accounts: 0, errors: ["Akun iklan belum diatur"] };
  const until = todayISO();
  const since = addDays(until, -Math.max(1, days - 1));
  const toks = tokens();
  const errors: string[] = [];
  let inserted = 0;
  let updated = 0;
  let total = 0;

  for (const acc of accounts) {
    let data: Awaited<ReturnType<typeof pull>> | null = null;
    let last = "";
    for (const t of toks) {
      try {
        data = await pull(acc.account, t, since, until);
        break;
      } catch (e) {
        last = (e as Error).message;
      }
    }
    if (!data) {
      errors.push(`${acc.account}: ${toks.length ? last : "token Meta tidak ditemukan"}`);
      continue;
    }
    const byId = new Map(data.campaigns.map((c) => [c.id, c]));
    const maxSpend = new Map<string, number>();
    for (const i of data.insights) maxSpend.set(i.campaign_id, Math.max(maxSpend.get(i.campaign_id) ?? 0, num(i.spend)));
    const lastDay = new Map<string, string>();
    for (const i of data.insights) if (i.date_start > (lastDay.get(i.campaign_id) ?? "")) lastDay.set(i.campaign_id, i.date_start);

    const rows = data.insights.map((i) => {
      const c = byId.get(i.campaign_id);
      const raw = num(c?.daily_budget);
      // Meta may report budgets in the smallest currency unit (×100): choose the reading that fits the real daily spend
      const budget = raw ? (raw / 100 >= (maxSpend.get(i.campaign_id) ?? 0) / 3 ? raw / 100 : raw) : null;
      const conv = (i.actions ?? []).filter((a) => MSG.test(a.action_type)).reduce((s, a) => Math.max(s, num(a.value)), 0);
      const st = c?.effective_status ?? "";
      const status = st === "ACTIVE" && lastDay.get(i.campaign_id) === i.date_start ? "Running" : st.includes("PAUSED") && lastDay.get(i.campaign_id) === i.date_start ? "Hold" : "Done";
      return { name: i.campaign_name, day: i.date_start, spend: num(i.spend), impressions: num(i.impressions), reach: num(i.reach), clicks: num(i.inline_link_clicks), views: data.withViews && i.views !== undefined ? num(i.views) : null, conv, budget, status };
    });
    total += rows.length;
    if (!rows.length) continue;

    const have = await q<{ id: number; campaign_name: string; d: string }>(
      `SELECT id, campaign_name, to_char(start_date, 'YYYY-MM-DD') AS d FROM ad_campaigns WHERE org_id = $1 AND brand = $2 AND platform = 'Meta' AND start_date BETWEEN $3 AND $4`,
      [orgId, acc.brand, since, until],
    );
    const idOf = new Map(have.map((h) => [`${h.campaign_name}|${h.d}`, h.id]));
    const upd = rows.filter((r) => idOf.has(`${r.name}|${r.day}`));
    const ins = rows.filter((r) => !idOf.has(`${r.name}|${r.day}`));
    const col = <K extends keyof (typeof rows)[number]>(list: typeof rows, k: K) => list.map((r) => r[k]);

    for (let s = 0; s < upd.length; s += 500) {
      const part = upd.slice(s, s + 500);
      await q(
        `UPDATE ad_campaigns a SET reach = v.reach, impressions = v.impressions, spend = v.spend, clicks = v.clicks, conversations = v.conv, views = COALESCE(v.views, a.views), daily_budget = COALESCE(v.budget, a.daily_budget), status = v.status, objective = COALESCE(a.objective, CASE WHEN v.conv > 0 THEN 'Pesan WhatsApp' END), updated_at = now()
         FROM (SELECT unnest($1::int[]) AS id, unnest($2::numeric[]) AS reach, unnest($3::numeric[]) AS impressions, unnest($4::numeric[]) AS spend, unnest($5::numeric[]) AS clicks, unnest($6::numeric[]) AS conv, unnest($7::numeric[]) AS views, unnest($8::numeric[]) AS budget, unnest($9::text[]) AS status) v
         WHERE a.id = v.id AND a.org_id = $10`,
        [part.map((r) => idOf.get(`${r.name}|${r.day}`)), col(part, "reach"), col(part, "impressions"), col(part, "spend"), col(part, "clicks"), col(part, "conv"), col(part, "views"), col(part, "budget"), col(part, "status"), orgId],
      );
    }
    for (let s = 0; s < ins.length; s += 500) {
      const part = ins.slice(s, s + 500);
      await q(
        `INSERT INTO ad_campaigns (org_id, brand, platform, campaign_name, start_date, end_date, reach, impressions, spend, clicks, conversations, views, daily_budget, status, objective)
         SELECT $1::int, $2::text, 'Meta', n, d::date, d::date, re, im, sp, cl, cv, vw, bu, st, CASE WHEN cv > 0 THEN 'Pesan WhatsApp' END
         FROM unnest($3::text[], $4::text[], $5::numeric[], $6::numeric[], $7::numeric[], $8::numeric[], $9::numeric[], $10::numeric[], $11::numeric[], $12::text[]) AS t(n, d, re, im, sp, cl, cv, vw, bu, st)`,
        [orgId, acc.brand, col(part, "name"), col(part, "day"), col(part, "reach"), col(part, "impressions"), col(part, "spend"), col(part, "clicks"), col(part, "conv"), col(part, "views"), col(part, "budget"), col(part, "status")],
      );
    }
    inserted += ins.length;
    updated += upd.length;
  }
  if (inserted + updated) await setSetting(syncKey(orgId), new Date().toISOString());
  return { rows: total, inserted, updated, accounts: accounts.length, errors };
}
