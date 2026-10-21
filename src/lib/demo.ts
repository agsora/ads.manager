import { RESOURCE_MAP } from "./resources";
import { insertMany } from "./repo";
import { addDays, monthStart, todayISO } from "./format";

// Small seeded PRNG so demo data is stable between runs
function rng(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export async function seedDemo(orgId: number) {
  const R = rng(7);
  const pick = <T,>(a: T[]) => a[Math.floor(R() * a.length)];
  const between = (a: number, b: number) => Math.round(a + R() * (b - a));
  const today = todayISO();
  const start = addDays(today, -75);
  const brands = ["Kembar Cafe", "Kembar Venue"];
  const fill = (key: string, rows: Record<string, unknown>[]) =>
    rows.map((r) => Object.fromEntries(RESOURCE_MAP[key].fields.map((f) => [f.key, r[f.key] ?? null])));

  // ---- ads
  const ads: Record<string, unknown>[] = [];
  const names = ["Promo Hotpot", "Hotplate Weekend", "Paket Wedding", "Family Deals", "Buffet Ramadhan", "Ulang Tahun Anak", "Meeting Kantor", "Live Music Night", "Menu Baru"];
  for (let d = start; d <= today; d = addDays(d, between(3, 6))) {
    const platform = R() < 0.7 ? "Meta" : "TikTok";
    const brand = pick(brands);
    const days = between(5, 10);
    const daily = pick([25000, 35000, 50000, 70000]);
    const spend = Math.round(daily * days * (0.85 + R() * 0.2));
    const cpm = platform === "Meta" ? between(9000, 16000) : between(5000, 10000);
    const impressions = Math.round((spend / cpm) * 1000);
    const freq = 1 + R() * (R() < 0.15 ? 3 : 0.9);
    const ctr = (platform === "Meta" ? 0.006 : 0.004) + R() * 0.014;
    const clicks = Math.round(impressions * ctr);
    const objective = pick(["Awareness", "Traffic", "Pesan WhatsApp", "Pesan WhatsApp", "Prospek"]);
    const conv = /Pesan|Prospek/.test(objective) ? Math.round(clicks * (0.05 + R() * 0.12)) : Math.round(clicks * 0.02);
    const end = addDays(d, days - 1);
    ads.push({
      brand, platform, objective,
      campaign_name: `${pick(names)} ${d.slice(5, 7)}/${d.slice(8)}`,
      focus: objective === "Awareness" ? "Brand awareness" : "Reservasi via WhatsApp",
      start_date: d, end_date: end, daily_budget: daily,
      reach: Math.round(impressions / freq), impressions, spend, clicks, views: Math.round(impressions * 0.7),
      conversations: conv,
      revenue: R() < 0.7 ? Math.round(spend * (0.6 + R() * 4.5)) : null,
      status: end < today ? "Done" : "Running",
      notes: null,
    });
  }

  // ---- wallets for current & previous month
  const wallets: Record<string, unknown>[] = [];
  for (const m of [monthStart(addDays(monthStart(today), -1)), monthStart(today)])
    for (const b of brands)
      for (const p of ["Meta", "TikTok"])
        wallets.push({ period: m, brand: b, platform: p, opening_balance: p === "Meta" ? between(1500000, 2500000) : between(200000, 600000), topup: p === "Meta" ? 1000000 : 300000, planned_topup: p === "Meta" ? 1500000 : 500000 });

  // ---- leads
  const leads: Record<string, unknown>[] = [];
  const first = ["Ismy", "Rina", "Budi", "Sari", "Dedi", "Tika", "Fajar", "Lina", "Andi", "Maya", "Rudi", "Nisa", "Yoga", "Wulan", "Hendra", "Putri"];
  const needs = ["Reservasi ulang tahun 20 orang", "Info menu family deals", "Rencana intimate wedding 150 pax", "Tanya harga buffet", "Acara kantor 40 orang", "Syukuran keluarga", "Info jam buka", "Paket meeting + makan siang"];
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const count = between(1, 5);
    for (let i = 0; i < count; i++) {
      const source = pick(["Ads Meta", "Ads Meta", "Ads Meta", "Ads TikTok", "Organik", "Organik", "Google", "Whatsapp Blast", "Influencer"]);
      const segment = pick(["HOT", "WARM", "WARM", "COLD", "COLD"]);
      const age = Math.round((new Date(today).getTime() - new Date(d).getTime()) / 86400000);
      const pDeal = segment === "HOT" ? 0.55 : segment === "WARM" ? 0.22 : 0.06;
      let final = "Follow-up";
      if (age > 4) final = R() < pDeal ? "Deal" : R() < 0.35 ? "Ghosting" : R() < 0.3 ? "Cancel" : age > 20 ? "Pending" : "Follow-up";
      leads.push({
        chat_date: d, brand: pick(brands),
        name: `${pick(first)} ${String.fromCharCode(65 + between(0, 25))}.`,
        phone: `08${between(11, 99)}-${between(1000, 9999)}-${between(1000, 9999)}`,
        customer_type: R() < 0.8 ? "Baru" : "Repeat Order",
        source, segment,
        plan_timing: pick(["Secepatnya", "Dalam 1 Minggu", "Dalam 2 Minggu", "Dalam 1 Bulan", "Masih belum tau"]),
        post_chat_status: pick(["Menunggu Respons", "Qualified Lead", "Berminat – Pertimbangan", "Tanya Informasi"]),
        initial_status: "Follow Up",
        need: pick(needs),
        followup_1: age >= 3 && R() < 0.75 ? "Sudah dihubungi, kirim pricelist" : null,
        followup_2: age >= 7 && R() < 0.5 ? "Tanya kepastian tanggal" : null,
        followup_3: null,
        final_status: final,
        deal_value: final === "Deal" ? between(3, 60) * 100000 : null,
        pic: pick(["CS Rani", "CS Dimas"]),
      });
    }
  }

  // ---- content
  const content: Record<string, unknown>[] = [];
  const titles = ["Behind the kitchen", "Menu andalan minggu ini", "Testimoni pelanggan", "Tips pilih venue wedding", "Promo weekend", "Giveaway follower", "Suasana malam live music", "Resep rahasia sambal", "Paket ulang tahun", "Q&A reservasi"];
  for (let d = start; d <= addDays(today, 10); d = addDays(d, between(1, 2))) {
    const channel = pick(["Instagram Feed", "Instagram Reels", "Instagram Reels", "TikTok", "Instagram Story"]);
    const past = d < today;
    const posted = past && R() < 0.85;
    const followers = channel === "TikTok" ? 3200 : 8400;
    const likes = posted ? between(60, channel.includes("Reels") ? 600 : 300) : null;
    content.push({
      post_date: d, post_time: pick(["11:00", "12:00", "18:30", "19:00"]), brand: pick(brands), channel,
      content_type: channel.includes("Reels") || channel === "TikTok" ? "Video/Reels" : pick(["Single Image", "Carousel"]),
      pillar: pick(["Edukasi", "Promosi", "Promosi", "Engagement", "Testimoni", "Behind The Scene"]),
      title: pick(titles), pic: pick(["Ayu", "Rizky"]),
      status: posted ? "Posted" : past ? pick(["Draft", "Cancel"]) : pick(["Ide", "Produksi", "Scheduled"]),
      actual_date: posted ? (R() < 0.85 ? d : addDays(d, 1)) : null,
      reach: posted ? between(800, 9000) : null, views: posted ? between(1000, 15000) : null,
      likes, comments: posted ? between(2, 40) : null, shares: posted ? between(0, 30) : null, saves: posted ? between(1, 60) : null,
      followers: posted ? followers : null,
    });
  }

  // followers snapshots weekly
  const followers: Record<string, unknown>[] = [];
  for (const b of brands)
    for (const ch of ["Instagram", "TikTok"]) {
      let f = ch === "Instagram" ? 8000 : 2800;
      for (let d = start; d <= today; d = addDays(d, 7)) {
        f += between(20, 140);
        followers.push({ snapshot_date: d, brand: b, channel: ch, followers: f });
      }
    }

  // reviews
  const reviews: Record<string, unknown>[] = [];
  const comments: [number, string, string][] = [
    [5, "Makanannya enak, pelayanan ramah", "Apresiasi / Kepuasan"], [5, "Tempat nyaman untuk keluarga", "Fasilitas"], [4, "Enak tapi agak lama", "Kecepatan Layanan"],
    [3, "Parkir sempit", "Fasilitas"], [2, "Pesanan lama datang", "Kecepatan Layanan"], [1, "Staf kurang ramah", "Profesionalisme Staf"], [5, "Venue wedding cantik", "Apresiasi / Kepuasan"], [4, "Harga sesuai rasa", "Harga & Biaya"],
  ];
  for (let d = start; d <= today; d = addDays(d, between(1, 3))) {
    const [rating, comment, category] = pick(comments);
    reviews.push({
      review_date: d, brand: pick(brands), branch: pick(["Nibung Raya", "SM Raja", "Pekanbaru"]), reviewer: `${pick(first)} ${pick(["S", "P", "W", "R"])}`,
      rating, comment, responded: R() < 0.7 ? "Ya" : "Tidak", sentiment: rating >= 4 ? "Positif" : rating === 3 ? "Netral" : "Negatif", category,
    });
  }

  // blasts
  const blasts: Record<string, unknown>[] = [];
  for (let d = addDays(start, 5); d <= today; d = addDays(d, between(8, 14))) {
    const sent = between(300, 1200);
    const delivered = Math.round(sent * (0.85 + R() * 0.13));
    const read = Math.round(delivered * (0.35 + R() * 0.4));
    const replied = Math.round(delivered * (0.03 + R() * 0.12));
    const l = Math.round(replied * 0.6);
    blasts.push({
      blast_date: d, brand: pick(brands), campaign_name: pick(["Promo Gajian", "Reaktivasi Leads Lama", "Info Menu Baru", "Undangan Live Music", "Paket Akhir Tahun"]),
      audience: pick(["Leads COLD 60 hari", "Pelanggan lama", "Leads ghosting", "Database member"]), tool: "Scooter",
      total_target: sent, sent, delivered, read_count: read, replied, failed: sent - delivered, leads: l, deals: Math.round(l * (0.1 + R() * 0.2)),
      revenue: null, cost: Math.round(sent * 150), status: "Terkirim",
    });
  }

  // influencers
  const infl: Record<string, unknown>[] = [];
  for (const [name, fee] of [["@kulinermedan", 1500000], ["@jajanpku", 800000], ["@weddingstory.id", 2500000], ["@foodiesmdn", 600000]] as [string, number][]) {
    const views = between(5000, 60000);
    infl.push({
      post_date: addDays(start, between(5, 70)), brand: pick(brands), influencer: name, platform: pick(["Instagram Reels", "TikTok"]), followers: between(10000, 120000),
      deal_type: pick(["Paid Endorse", "Barter"]), fee, views, engagement: Math.round(views * (0.02 + R() * 0.06)), leads: between(2, 25),
      revenue: Math.round(fee * (0.4 + R() * 3)), status: "Selesai",
    });
  }

  // KPI targets for current + previous month
  const kpi: Record<string, unknown>[] = [];
  for (const m of [monthStart(addDays(monthStart(today), -1)), monthStart(today)])
    for (const b of brands)
      kpi.push({ period: m, brand: b, target_posts: 16, target_er: 0.03, target_leads: 45, target_deals: 10, target_revenue: 25000000, ads_budget: 2500000, max_cpl: 40000, target_rating: 4.6 });

  const events = [
    { event_date: addDays(today, 6), title: "Gajian / Payday Promo", event_type: "Promo" },
    { event_date: addDays(today, 15), title: "Launching Menu Baru", event_type: "Launching", brand: "Kembar Cafe" },
    { event_date: addDays(today, 24), title: "Open House Wedding Venue", event_type: "Event Internal", brand: "Kembar Venue" },
  ];

  const counts: Record<string, number> = {};
  for (const [key, rows] of Object.entries({ ads, wallets, leads, content, followers, reviews, blast: blasts, influencers: infl, kpi, events })) {
    counts[key] = await insertMany(orgId, RESOURCE_MAP[key], fill(key, rows));
  }
  return counts;
}
