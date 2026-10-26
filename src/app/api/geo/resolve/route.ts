import { NextResponse } from "next/server";
import { handle, HttpError, requireSession } from "@/lib/auth";
import { q } from "@/lib/db";

export const maxDuration = 30;

// Only Google Maps hosts are followed (no arbitrary URL fetching from the server).
const ALLOWED = /^(?:[\w-]+\.)*(?:google\.com|google\.co\.id|goo\.gl|g\.co)$/i;

const PATTERNS = [/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/, /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/, /[?&](?:q|ll|query|center|destination)=(-?\d{1,3}\.\d+)(?:,|%2C)(-?\d{1,3}\.\d+)/i];

/** Reads a coordinate pair out of a Maps URL. Only the URL is read, never page content (page content holds unrelated coordinates). */
function coordsFromUrl(raw: string): { lat: number; lng: number } | null {
  let url = raw;
  for (let i = 0; i < 3; i++) {
    for (const re of PATTERNS) {
      const m = re.exec(url);
      if (m) {
        const lat = Number(m[1]);
        const lng = Number(m[2]);
        if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
      }
    }
    try {
      const d = decodeURIComponent(url);
      if (d === url) break;
      url = d; // consent pages carry the real URL in an encoded parameter
    } catch {
      break;
    }
  }
  return null;
}

/** Follows redirects by hand (max 6 hops) and stays on Google hosts. Returns every URL seen on the way. */
async function follow(start: string): Promise<string[]> {
  const seen: string[] = [];
  let url = start;
  for (let hop = 0; hop < 6; hop++) {
    const u = new URL(url);
    if (u.protocol !== "https:" || !ALLOWED.test(u.hostname)) break;
    seen.push(url);
    if (coordsFromUrl(url)) break;
    const r = await fetch(url, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", "accept-language": "id,en;q=0.8" }, signal: AbortSignal.timeout(8000) });
    const loc = r.headers.get("location");
    if (!loc || r.status < 300 || r.status > 399) break;
    url = new URL(loc, url).toString();
  }
  return seen;
}

/**
 * POST { link, brand?, branch? } → find the point behind a Google Maps link.
 * With brand + branch the point is also saved on that branch's latest recap row.
 */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  const b = (await req.json()) as { link?: string; brand?: string; branch?: string };
  const link = String(b.link ?? "").trim();
  let host = "";
  try {
    host = new URL(link).hostname;
  } catch {
    throw new HttpError(400, "Link tidak valid");
  }
  if (!ALLOWED.test(host)) throw new HttpError(400, "Hanya link Google Maps yang bisa dibaca");

  let point = coordsFromUrl(link);
  if (!point) {
    const urls = await follow(link).catch(() => []);
    for (const u of urls) {
      point = coordsFromUrl(u);
      if (point) break;
    }
  }
  if (!point) throw new HttpError(422, "Titik tidak ditemukan di link ini. Isi latitude dan longitude secara manual di form rekap.");

  if (b.branch !== undefined || b.brand !== undefined) {
    await q(
      `UPDATE review_stats SET lat = $1, lng = $2, updated_at = now()
        WHERE id = (SELECT id FROM review_stats WHERE org_id = $3 AND brand IS NOT DISTINCT FROM $4 AND branch IS NOT DISTINCT FROM $5 ORDER BY snapshot_date DESC, id DESC LIMIT 1)`,
      [point.lat, point.lng, s.org, b.brand || null, b.branch || null],
    );
  }
  return NextResponse.json(point);
});
