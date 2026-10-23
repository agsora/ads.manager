import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { buildAnalytics } from "./analytics";
import { getSetting, setSetting } from "./db";
import { HttpError } from "./auth";
import { todayISO } from "./format";

export const MODEL = process.env.AI_MODEL || "claude-opus-5-5";
export const DAILY_LIMIT = 30;

export const AREAS = ["Iklan", "Leads & Akad", "Konten", "Blast & Remarketing", "Cabang & CS", "Budget & Saldo", "Reputasi", "Kepatuhan"] as const;

export const AdviceSchema = z.object({
  ringkasan: z.string().describe("2-3 kalimat: kondisi periode ini dan satu hal terpenting yang harus dilakukan"),
  saran: z
    .array(
      z.object({
        judul: z.string().describe("Judul tindakan, maksimal 12 kata"),
        area: z.enum(AREAS),
        prioritas: z.enum(["tinggi", "sedang", "rendah"]),
        temuan: z.string().describe("Bukti dari data: sebut angka konkret"),
        langkah: z.array(z.string()).describe("3 sampai 5 langkah konkret yang bisa dikerjakan minggu ini"),
        pic: z.string().describe("Siapa yang mengerjakan, misalnya Tim iklan, CS cabang, Admin"),
        metrik: z.string().describe("Angka yang dipantau dan target perbaikannya"),
        dampak: z.string().describe("Perkiraan dampak yang jujur, tanpa janji pasti"),
      }),
    )
    .describe("4 sampai 6 saran, urut dari prioritas tertinggi"),
  pertanyaan: z.array(z.string()).describe("0 sampai 3 data yang belum ada dan akan membuat saran berikutnya lebih tepat"),
});
export type Advice = z.infer<typeof AdviceSchema>;

export interface StoredAdvice {
  at: string;
  model: string;
  focus: string;
  period: { from: string; to: string; brand: string | null };
  advice: Advice;
}

/** Different lenses so repeated requests look at the same data from a new direction. */
const ANGLES = [
  "efisiensi biaya: di mana biaya per lead, per survei, atau per akad bisa ditekan tanpa mengurangi hasil",
  "kecepatan dan kualitas tindak lanjut lead: respons pertama, follow up, lead HOT yang menggantung",
  "kreatif dan pesan iklan: apa yang perlu diuji, diulang, atau dihentikan",
  "targeting dan sumber trafik: kanal mana yang layak ditambah atau dikurangi",
  "kinerja cabang dan CS: siapa yang perlu dibantu dan praktik terbaik mana yang bisa ditiru",
  "peluang cepat 7 hari ke depan yang paling murah dikerjakan",
  "risiko tersembunyi: saldo iklan, ketergantungan pada satu kanal, data yang tidak lengkap, kepatuhan promosi",
  "blast dan remarketing nasabah lama: segmen, waktu kirim, dan pesan",
];

const FOCUS_HINT: Record<string, string> = {
  iklan: "Fokus utama: performa iklan (CTR, biaya, creative, saldo).",
  leads: "Fokus utama: leads, follow up, funnel pembiayaan sampai akad, respons chat.",
  konten: "Fokus utama: konten organik, jadwal posting, engagement.",
  blast: "Fokus utama: WA blast, remarketing, daftar jangan dihubungi.",
  biaya: "Fokus utama: efisiensi biaya per lead, per survei, per akad.",
};

const SYSTEM = `Kamu adalah konsultan digital marketing senior untuk perusahaan pembiayaan (multifinance) di Indonesia yang menjual pembiayaan dengan jaminan BPKB kendaraan, dengan beberapa cabang.

Tugasmu: membaca ringkasan data marketing satu periode lalu memberi saran yang benar-benar bisa dikerjakan tim minggu ini.

Aturan:
- Dasarkan semua saran pada data yang diberikan. Kutip angka konkret di bagian temuan. Jangan mengarang angka, benchmark, atau fakta yang tidak ada di data.
- Kalau data terlalu sedikit untuk menyimpulkan sesuatu, katakan terus terang dan taruh di bagian pertanyaan, jangan memaksakan saran.
- Daftar "insight otomatis" adalah temuan dari aturan tetap sistem. Jangan mengulangnya mentah-mentah: tambahkan hal baru, hubungkan beberapa data, atau perjelas langkahnya.
- Setiap saran harus spesifik: siapa mengerjakan apa, bagaimana caranya, dan angka apa yang dipantau. Hindari nasihat umum seperti "tingkatkan kualitas konten".
- Dampak ditulis sebagai perkiraan jujur, bukan janji.
- Ini industri yang diawasi OJK: jangan menyarankan klaim seperti "pasti cair", "tanpa survei", atau bunga yang menyesatkan. Sertakan sisi kepatuhan bila relevan.
- Gunakan bahasa Indonesia yang ringkas dan langsung. Tidak ada data pribadi nasabah dalam masukan; jangan memintanya.`;

const round = (v: unknown): unknown => (typeof v === "number" ? (Number.isInteger(v) ? v : Math.round(v * 1000) / 1000) : v);
const strip = <T extends Record<string, unknown>>(o: T): Record<string, unknown> => Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v !== "object" || v === null).map(([k, v]) => [k, round(v)]));

/** A compact, personal-data-free snapshot of the period for the model. */
export async function buildContext(orgId: number, from: string, to: string, brand: string | null) {
  const a = await buildAnalytics(orgId, { from, to, brand });
  const pick = <T extends Record<string, unknown>>(rows: T[], keys: string[], n: number) => rows.slice(0, n).map((r) => Object.fromEntries(keys.map((k) => [k, round(r[k])])));
  return {
    periode: { dari: from, sampai: to, hari: a.period.days, brand: brand || "semua brand" },
    skor_kesehatan: a.scores,
    kpi_periode_ini: { iklan: strip(a.kpis.ads), leads: strip(a.kpis.leads), konten: strip(a.kpis.content), ulasan: strip(a.kpis.reviews), blast: strip(a.kpis.blast), influencer: strip(a.kpis.influencer) },
    kpi_periode_sebelumnya: { iklan: strip(a.prevKpis.ads), leads: strip(a.prevKpis.leads), konten: strip(a.prevKpis.content), blast: strip(a.prevKpis.blast) },
    total_biaya_dan_hasil: strip(a.overall),
    funnel_iklan: a.funnel,
    funnel_pembiayaan: { tahap: a.financing.funnel, biaya_per_survei: round(a.financing.costPerSurvey), biaya_per_akad: round(a.financing.costPerAkad), nilai_pencairan: a.financing.disbursed, rata_rata_pencairan: round(a.financing.avgTicket), pelacakan_tahap_diisi: a.financing.tracked },
    kecepatan_respons_chat: { ...Object.fromEntries(Object.entries(a.financing.sla).map(([k, v]) => [k, round(v)])) },
    per_cabang: pick(a.financing.byBranch, ["name", "leads", "hot", "survey", "approve", "akad", "akadRate", "disbursed", "avgReply", "within5"], 8),
    per_cs: pick(a.financing.byPic, ["name", "leads", "akad", "akadRate", "avgReply", "within5"], 8),
    sumber_leads: pick(a.leadsBySource, ["name", "leads", "hot", "deals", "dealRate", "ghost", "cost", "cpl", "cpa"], 8),
    atribusi_campaign: pick(a.attribution, ["ref", "leads", "deals", "dealRate", "spend", "cpl", "cpa", "roas"], 6),
    campaign_iklan: pick(a.campaigns, ["name", "platform", "spend", "ctr", "cpc", "conversations", "cpConv", "frequency", "attrLeads", "attrDeals"], 8),
    nomor_dobel: { nomor_unik: a.duplicates.uniqueLeads, chat_berlebih: a.duplicates.extra },
    konten_per_channel: pick(a.contentByChannel, ["name", "planned", "posted", "avgER", "reach"], 6),
    saldo_iklan: pick(a.wallets, ["brand", "platform", "kind", "closing", "spent", "burnPerDay", "daysLeft"], 6),
    event_mendatang: a.events.slice(0, 5).map((e) => ({ tanggal: String(e.event_date), nama: e.title, rencana_budget: e.planned_budget ?? null, target_leads: e.target_leads ?? null })),
    insight_otomatis_yang_sudah_ada: a.insights.slice(0, 14).map((i) => `[${i.level}] ${i.title}`),
  };
}

export type Provider = "claude" | "gemini";
/** Claude when a paid key exists, otherwise Gemini's free tier when its key exists. */
export function provider(): Provider | null {
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return null;
}
export const aiConfigured = () => provider() !== null;

export async function usedToday(orgId: number) {
  return Number((await getSetting(`ai:count:${orgId}:${todayISO()}`)) ?? 0) || 0;
}

export async function lastAdvice(orgId: number): Promise<StoredAdvice | null> {
  try {
    const raw = await getSetting(`ai:last:${orgId}`);
    return raw ? (JSON.parse(raw) as StoredAdvice) : null;
  } catch {
    return null;
  }
}

/** The instruction block shared by the API call and the copy-paste prompt: lens, previous titles to avoid, data. */
export async function buildUserPrompt(opts: { orgId: number; from: string; to: string; brand: string | null; focus: string; previousTitles: string[] }) {
  const ctx = await buildContext(opts.orgId, opts.from, opts.to, opts.brand);
  if (process.env.AI_DEBUG) console.log("[ai] context chars:", JSON.stringify(ctx).length);
  // pick two random lenses each time so repeated requests don't converge on the same answer
  const angles = [...ANGLES].sort(() => Math.random() - 0.5).slice(0, 2);
  const lens = FOCUS_HINT[opts.focus] ?? `Sudut pandang untuk kali ini: ${angles[0]}; dan ${angles[1]}.`;
  const avoid = opts.previousTitles.length ? `\n\nSaran yang sudah pernah ditampilkan (jangan diulang, cari hal lain):\n${opts.previousTitles.map((t) => `- ${t}`).join("\n")}` : "";
  return `${lens}${avoid}

Data periode (JSON):
${JSON.stringify(ctx)}`;
}

/** Plain-text prompt for pasting into the Claude app (no API key; uses the person's own subscription). */
export async function buildPastePrompt(opts: { orgId: number; from: string; to: string; brand: string | null; focus: string }) {
  const user = await buildUserPrompt({ ...opts, previousTitles: [] });
  return `${SYSTEM}

Format jawaban: tulis dalam bahasa Indonesia dengan format berikut, tanpa tabel.
1. "Ringkasan" 2-3 kalimat.
2. 4 sampai 6 saran bernomor, urut dari prioritas tertinggi. Setiap saran berisi: Judul, Area, Prioritas (tinggi/sedang/rendah), Temuan (sebut angka dari data), Langkah (3-5 butir), Penanggung jawab, Angka yang dipantau, Perkiraan dampak.
3. "Data yang akan membuat saran lebih tepat" (0-3 butir).

${user}`;
}

const GEMINI_BASE = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";
let geminiModelCache: string | null = null;

/** GEMINI_MODEL wins; otherwise ask the API which models exist and take the newest plain "flash" one. */
async function geminiModel(key: string): Promise<string> {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;
  if (geminiModelCache) return geminiModelCache;
  const r = await fetch(`${GEMINI_BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new HttpError(r.status === 400 || r.status === 403 ? 503 : 502, r.status === 400 || r.status === 403 ? "GEMINI_API_KEY tidak valid atau belum diizinkan." : "Layanan AI sedang bermasalah. Coba lagi sebentar.");
  const j = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  const names = (j.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent") && /flash/i.test(m.name) && !/lite|image|tts|live|audio|embedding|exp|preview|thinking|8b/i.test(m.name))
    .map((m) => m.name.replace(/^models\//, ""))
    .sort()
    .reverse();
  if (!names.length) throw new HttpError(502, "Tidak ada model Gemini yang cocok. Atur GEMINI_MODEL di server.");
  geminiModelCache = names[0];
  return names[0];
}

async function callGemini(prompt: string): Promise<{ advice: Advice; model: string }> {
  const key = process.env.GEMINI_API_KEY!;
  const model = await geminiModel(key);
  const example = JSON.stringify({
    ringkasan: "…",
    saran: [{ judul: "…", area: AREAS[0], prioritas: "tinggi", temuan: "…", langkah: ["…", "…", "…"], pic: "…", metrik: "…", dampak: "…" }],
    pertanyaan: ["…"],
  });
  let res: Response;
  try {
    res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(55_000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [
          {
            role: "user",
            parts: [{ text: `${prompt}

Jawab HANYA dengan JSON yang persis berbentuk seperti contoh ini (area harus salah satu dari: ${AREAS.join(", ")}; prioritas: tinggi, sedang, atau rendah; 4 sampai 6 saran):
${example}` }],
          },
        ],
        generationConfig: { responseMimeType: "application/json", temperature: 1, maxOutputTokens: 8000 },
      }),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") throw new HttpError(504, "Layanan AI terlalu lama merespons. Coba lagi.");
    throw new HttpError(502, "Tidak bisa menghubungi layanan AI. Coba lagi sebentar.");
  }
  if (res.status === 429) throw new HttpError(429, "Batas gratis Gemini sedang habis. Coba lagi beberapa menit lagi atau besok.");
  if (res.status === 400 || res.status === 401 || res.status === 403) throw new HttpError(503, "GEMINI_API_KEY tidak valid atau belum diizinkan.");
  if (!res.ok) {
    console.error("gemini", res.status, (await res.text()).slice(0, 300));
    throw new HttpError(502, "Layanan AI sedang bermasalah. Coba lagi sebentar.");
  }
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
  if (j.promptFeedback?.blockReason) throw new HttpError(422, "AI menolak memproses permintaan ini. Coba ubah filter periode atau brand.");
  const text = (j.candidates?.[0]?.content?.parts ?? []).map((x) => x.text ?? "").join("").trim();
  try {
    const parsed = AdviceSchema.safeParse(JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")));
    if (parsed.success) return { advice: parsed.data, model };
  } catch {
    /* fall through */
  }
  throw new HttpError(502, "Jawaban AI tidak bisa dibaca. Coba buat ulang.");
}

async function callClaude(prompt: string): Promise<{ advice: Advice; model: string }> {
  const client = new Anthropic({ timeout: 55_000, maxRetries: 1 });
  let response;
  try {
    response = await client.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: zodOutputFormat(AdviceSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new HttpError(503, "ANTHROPIC_API_KEY tidak valid. Periksa kunci API di pengaturan server.");
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "Layanan AI sedang sibuk. Coba lagi sebentar.");
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw new HttpError(504, "Layanan AI terlalu lama merespons. Coba lagi.");
    if (e instanceof Anthropic.APIError) {
      console.error("anthropic", e.status, e.message);
      throw new HttpError(502, "Layanan AI sedang bermasalah. Coba lagi sebentar.");
    }
    throw e;
  }
  if (response.stop_reason === "refusal") throw new HttpError(422, "AI menolak memproses permintaan ini. Coba ubah filter periode atau brand.");
  if (!response.parsed_output) throw new HttpError(502, "Jawaban AI tidak bisa dibaca. Coba buat ulang.");
  return { advice: response.parsed_output, model: MODEL };
}

export async function generateAdvice(opts: { orgId: number; from: string; to: string; brand: string | null; focus: string; previousTitles: string[] }): Promise<StoredAdvice> {
  const prov = provider();
  if (!prov) throw new HttpError(503, "Fitur AI belum diaktifkan: belum ada kunci API (GEMINI_API_KEY gratis atau ANTHROPIC_API_KEY) di server.");
  const used = await usedToday(opts.orgId);
  if (used >= DAILY_LIMIT) throw new HttpError(429, `Batas ${DAILY_LIMIT} permintaan AI per hari sudah tercapai. Coba lagi besok.`);

  const prompt = await buildUserPrompt(opts);
  const { advice, model } = prov === "claude" ? await callClaude(prompt) : await callGemini(prompt);

  await setSetting(`ai:count:${opts.orgId}:${todayISO()}`, String(used + 1));
  const stored: StoredAdvice = { at: new Date().toISOString(), model, focus: opts.focus, period: { from: opts.from, to: opts.to, brand: opts.brand }, advice };
  await setSetting(`ai:last:${opts.orgId}`, JSON.stringify(stored));
  return stored;
}
