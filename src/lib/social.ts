/**
 * Pull engagement numbers from a post link.
 *  - TikTok / YouTube: read from the public page (no login needed).
 *  - Instagram / Facebook: not readable without login; works through the official Meta Graph API
 *    when IG_ACCESS_TOKEN + IG_USER_ID are configured (reach & saves & shares come from Insights).
 */

export interface Metrics {
  reach?: number;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
}
export interface MetricsResult {
  ok: boolean;
  platform: string;
  metrics: Metrics;
  missing: string[];
  message?: string;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const ALLOWED = [/(^|\.)tiktok\.com$/, /(^|\.)youtube\.com$/, /^youtu\.be$/, /(^|\.)instagram\.com$/, /(^|\.)facebook\.com$/, /^fb\.watch$/];

export function platformOf(url: string): string | null {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (/tiktok\.com$/.test(h)) return "tiktok";
    if (/youtube\.com$|^youtu\.be$/.test(h)) return "youtube";
    if (/instagram\.com$/.test(h)) return "instagram";
    if (/facebook\.com$|^fb\.watch$/.test(h)) return "facebook";
  } catch {
    /* not a url */
  }
  return null;
}

/** Fetches a page, following redirects by hand so every hop stays on an allowed host (no SSRF). */
async function fetchPage(url: string): Promise<string> {
  let cur = url;
  for (let hop = 0; hop < 5; hop++) {
    const u = new URL(cur);
    if (u.protocol !== "https:" || !ALLOWED.some((re) => re.test(u.hostname.toLowerCase()))) throw new Error("Link tidak didukung (hanya TikTok, YouTube, Instagram, Facebook)");
    const r = await fetch(cur, { redirect: "manual", headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" }, signal: AbortSignal.timeout(15000) });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
      cur = new URL(r.headers.get("location")!, cur).toString();
      continue;
    }
    if (!r.ok) throw new Error(`Halaman tidak bisa dibuka (HTTP ${r.status})`);
    return (await r.text()).slice(0, 3_000_000);
  }
  throw new Error("Terlalu banyak pengalihan link");
}

const num = (v: unknown) => {
  const x = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(x) && String(v ?? "") !== "" ? x : undefined;
};

async function tiktok(url: string): Promise<Metrics> {
  const html = await fetchPage(url);
  const m = html.match(/"statsV2":\{([^}]*)\}/) ?? html.match(/"stats":\{([^}]*)\}/);
  if (!m) throw new Error("Data TikTok tidak ditemukan di halaman (video privat atau dibatasi)");
  const get = (k: string) => num(m[1].match(new RegExp(`"${k}":"?(\\d+)`))?.[1]);
  return { views: get("playCount"), likes: get("diggCount"), comments: get("commentCount"), shares: get("shareCount"), saves: get("collectCount") };
}

async function youtube(url: string): Promise<Metrics> {
  const html = await fetchPage(url);
  const views = num(html.match(/"viewCount":"(\d+)"/)?.[1]);
  if (views === undefined) throw new Error("Data YouTube tidak ditemukan di halaman");
  return { views, likes: num(html.match(/"likeCount":"(\d+)"/)?.[1]), comments: num(html.match(/"commentCount":\{[^}]*?"simpleText":"([\d.,]+)"/)?.[1]) };
}

const IG_API = "https://graph.facebook.com/v21.0";
const IG_LOGIN_API = "https://graph.instagram.com/v21.0";
/** Tokens made with "Instagram Login" start with IG… and only work on graph.instagram.com; system-user/page tokens use graph.facebook.com. */
const igApi = (token: string) => (/^IG/.test(token) ? IG_LOGIN_API : IG_API);

/**
 * Connected Instagram accounts from the environment. The first pair is IG_ACCESS_TOKEN + IG_USER_ID;
 * every extra account is another pair with the same suffix, e.g. IG_ACCESS_TOKEN_OTO + IG_USER_ID_OTO.
 */
function igAccounts() {
  const list: { name: string; token: string; id: string }[] = [];
  const env = process.env;
  if (env.IG_ACCESS_TOKEN && env.IG_USER_ID) list.push({ name: "utama", token: env.IG_ACCESS_TOKEN, id: env.IG_USER_ID });
  for (const k of Object.keys(env)) {
    const m = /^IG_ACCESS_TOKEN_(.+)$/.exec(k);
    const id = m ? env[`IG_USER_ID_${m[1]}`] : undefined;
    if (m && env[k] && id) list.push({ name: m[1].toLowerCase(), token: env[k]!, id });
  }
  return list;
}

type IgMedia = { id: string; permalink: string; like_count?: number; comments_count?: number };

async function igFind(acc: { token: string; id: string }, code: string): Promise<IgMedia | null> {
  // walks the latest 200 posts of this account
  let next: string | null = `${igApi(acc.token)}/${acc.id}/media?fields=id,permalink,like_count,comments_count&limit=50&access_token=${acc.token}`;
  for (let page = 0; page < 4 && next; page++) {
    const j: { data?: IgMedia[]; paging?: { next?: string }; error?: { message: string } } = await (await fetch(next, { signal: AbortSignal.timeout(15000) })).json();
    if (j.error) throw new Error(j.error.message);
    const hit = j.data?.find((x) => x.permalink.includes(`/${code}/`));
    if (hit) return hit;
    next = j.paging?.next ?? null;
  }
  return null;
}

async function instagram(url: string): Promise<Metrics> {
  const accounts = igAccounts();
  if (!accounts.length)
    throw new Error("Instagram tidak bisa dibaca dari link tanpa login. Hubungkan Instagram Graph API (IG_ACCESS_TOKEN & IG_USER_ID) atau isi manual.");
  const code = new URL(url).pathname.split("/").filter(Boolean).find((_, i, a) => ["p", "reel", "reels", "tv"].includes(a[i - 1] ?? ""));
  if (!code) throw new Error("Link Instagram tidak dikenali (harus /p/… atau /reel/…)");
  // the post belongs to one of the connected accounts: try each until its permalink turns up
  let media: IgMedia | null = null;
  let acc = accounts[0];
  let lastError = "";
  for (const a of accounts) {
    try {
      media = await igFind(a, code);
    } catch (e) {
      lastError = `Instagram API (${a.name}): ${(e as Error).message}`;
      continue;
    }
    if (media) {
      acc = a;
      break;
    }
  }
  if (!media) throw new Error(lastError || `Postingan tidak ditemukan di ${accounts.length > 1 ? `${accounts.length} akun Instagram yang terhubung` : "akun Instagram yang terhubung"}`);
  const out: Metrics = { likes: media.like_count, comments: media.comments_count };
  const ins: { data?: { name: string; values?: { value: number }[]; total_value?: { value: number } }[]; error?: { message: string } } = await (
    await fetch(`${igApi(acc.token)}/${media.id}/insights?metric=reach,views,saved,shares&access_token=${acc.token}`, { signal: AbortSignal.timeout(15000) })
  ).json();
  for (const d of ins.data ?? []) {
    const v = d.total_value?.value ?? d.values?.[0]?.value;
    if (d.name === "reach") out.reach = v;
    if (d.name === "views") out.views = v;
    if (d.name === "saved") out.saves = v;
    if (d.name === "shares") out.shares = v;
  }
  return out;
}

export async function fetchMetrics(url: string): Promise<MetricsResult> {
  const platform = platformOf(url);
  if (!platform) return { ok: false, platform: "unknown", metrics: {}, missing: [], message: "Link bukan TikTok, YouTube, Instagram atau Facebook" };
  try {
    const metrics = platform === "tiktok" ? await tiktok(url) : platform === "youtube" ? await youtube(url) : platform === "instagram" ? await instagram(url) : await Promise.reject(new Error("Facebook belum didukung — isi manual"));
    const clean = Object.fromEntries(Object.entries(metrics).filter(([, v]) => v !== undefined && Number.isFinite(v))) as Metrics;
    const wanted: (keyof Metrics)[] = ["reach", "views", "likes", "comments", "shares", "saves"];
    const missing = wanted.filter((k) => clean[k] === undefined);
    return { ok: Object.keys(clean).length > 0, platform, metrics: clean, missing, message: Object.keys(clean).length ? undefined : "Tidak ada angka yang bisa dibaca" };
  } catch (e) {
    return { ok: false, platform, metrics: {}, missing: [], message: (e as Error).message };
  }
}

/** Follower count of every connected Instagram account (read from the profile, no post needed). */
export async function igFollowers() {
  return Promise.all(
    igAccounts().map(async (a) => {
      const brand = process.env[`IG_BRAND_${a.name.toUpperCase()}`];
      try {
        const j: { followers_count?: number; username?: string; name?: string; error?: { message: string } } = await (await fetch(`${igApi(a.token)}/${a.id}?fields=followers_count,username,name&access_token=${a.token}`, { signal: AbortSignal.timeout(15000) })).json();
        if (j.error || typeof j.followers_count !== "number") throw new Error(j.error?.message ?? "followers_count tidak ada");
        return { account: a.name, brand, username: j.username ?? "", displayName: j.name ?? "", followers: j.followers_count, error: "" };
      } catch (e) {
        return { account: a.name, brand, username: "", displayName: "", followers: 0, error: `Akun ${a.name}: ${(e as Error).message}` };
      }
    }),
  );
}
