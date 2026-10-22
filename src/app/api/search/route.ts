import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth";
import { q } from "@/lib/db";

interface Hit {
  type: string;
  title: string;
  sub: string;
  href: string;
}

/** Global search (Ctrl+K): a few best matches from each module. */
export const GET = handle(async (req: Request) => {
  const s = await requireSession();
  const term = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (term.length < 2) return NextResponse.json({ hits: [] });
  const like = `%${term.replace(/[%_]/g, "")}%`;
  const run = <T,>(sql: string) => q<T>(sql, [s.org, like]);
  const [leads, contacts, content, ads, reviews, infl, events] = await Promise.all([
    run<{ name: string; phone: string; source: string; segment: string; chat_date: string }>(
      `SELECT name, phone, source, segment, chat_date FROM leads WHERE org_id=$1 AND (name ILIKE $2 OR phone ILIKE $2 OR need ILIKE $2 OR campaign_ref ILIKE $2) ORDER BY chat_date DESC LIMIT 5`,
    ),
    run<{ name: string; contract_no: string; unit_type: string; status: string }>(
      `SELECT name, contract_no, unit_type, status FROM blast_contacts WHERE org_id=$1 AND (name ILIKE $2 OR contract_no ILIKE $2 OR phone ILIKE $2 OR phone_official ILIKE $2 OR unit_type ILIKE $2) LIMIT 5`,
    ),
    run<{ title: string; post_date: string; channel: string; status: string }>(
      `SELECT title, post_date, channel, status FROM content_plans WHERE org_id=$1 AND (title ILIKE $2 OR caption ILIKE $2 OR pic ILIKE $2) ORDER BY post_date DESC LIMIT 5`,
    ),
    run<{ campaign_name: string; platform: string; brand: string }>(
      `SELECT DISTINCT campaign_name, platform, brand FROM ad_campaigns WHERE org_id=$1 AND campaign_name ILIKE $2 LIMIT 5`,
    ),
    run<{ reviewer: string; rating: number; comment: string }>(
      `SELECT reviewer, rating, comment FROM reviews WHERE org_id=$1 AND (reviewer ILIKE $2 OR comment ILIKE $2) ORDER BY review_date DESC LIMIT 4`,
    ),
    run<{ influencer: string; platform: string }>(`SELECT influencer, platform FROM influencer_campaigns WHERE org_id=$1 AND influencer ILIKE $2 LIMIT 3`),
    run<{ title: string; event_date: string }>(`SELECT title, event_date FROM marketing_events WHERE org_id=$1 AND title ILIKE $2 LIMIT 3`),
  ]);
  const d = (v: unknown) => String(v ?? "").slice(0, 10);
  const hits: Hit[] = [
    ...leads.map((r) => ({ type: "Lead", title: r.name || r.phone, sub: [r.phone, r.source, r.segment, d(r.chat_date)].filter(Boolean).join(" · "), href: "/leads" })),
    ...contacts.map((r) => ({ type: "Kontak blast", title: r.name, sub: [r.contract_no, r.unit_type, r.status].filter(Boolean).join(" · "), href: "/blast" })),
    ...content.map((r) => ({ type: "Konten", title: r.title, sub: [d(r.post_date), r.channel, r.status].filter(Boolean).join(" · "), href: "/content" })),
    ...ads.map((r) => ({ type: "Campaign", title: r.campaign_name, sub: [r.brand, r.platform].filter(Boolean).join(" · "), href: "/ads" })),
    ...reviews.map((r) => ({ type: "Ulasan", title: `${r.reviewer ?? "Anonim"} · ${r.rating}★`, sub: String(r.comment ?? "").slice(0, 80), href: "/reviews" })),
    ...infl.map((r) => ({ type: "Influencer", title: r.influencer, sub: r.platform ?? "", href: "/influencers" })),
    ...events.map((r) => ({ type: "Event", title: r.title, sub: d(r.event_date), href: "/promo" })),
  ];
  return NextResponse.json({ hits });
});
