import { buildContext, GEMINI_BASE, geminiCandidates } from "./ai-advice";
import { HttpError } from "./auth";
import { getSetting, setSetting } from "./db";
import { addDays, monthEnd, monthStart, todayISO } from "./format";
import { listRows } from "./repo";
import { n, RESOURCES, RESOURCE_MAP, type Resource, type Row } from "./resources";

export const CHAT_DAILY_LIMIT = 80;
const MAX_ROWS = 40;
const MAX_STEPS = 6;
const BUDGET_MS = 52_000;

/** Whether the AI may see customer names and phone numbers (off unless an owner/admin turns it on). */
export async function allowPII(orgId: number) {
  return (await getSetting(`ai:pii:${orgId}`)) === "1";
}
export const setAllowPII = (orgId: number, on: boolean) => setSetting(`ai:pii:${orgId}`, on ? "1" : "0");
export const chatUsedToday = async (orgId: number) => Number((await getSetting(`ai:chat:${orgId}:${todayISO()}`)) ?? 0) || 0;

// ---------------------------------------------------------------------------------------------
// Privacy: by default the model sees initials, the last digits of numbers, and shortened free text.
// ---------------------------------------------------------------------------------------------
const NAME_KEYS = new Set(["name", "reviewer", "customer", "nama"]);
const PHONE_KEYS = new Set(["phone", "phone_official"]);
const initials = (v: string) =>
  v
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + ".")
    .join(" ");
const maskDigits = (s: string) => s.replace(/\d{7,}/g, (m) => "•".repeat(m.length - 3) + m.slice(-3));

function cleanValue(key: string, type: string, v: unknown, pii: boolean): unknown {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Math.round(v * 1000) / 1000;
  const s = String(v);
  if (pii) return s.length > 300 ? s.slice(0, 300) + "…" : s;
  if (NAME_KEYS.has(key)) return initials(s);
  if (PHONE_KEYS.has(key) || key === "contract_no") return s.length > 3 ? "•".repeat(s.length - 3) + s.slice(-3) : "•••";
  if (type === "longtext" || key === "comment") return maskDigits(s).slice(0, 140);
  return maskDigits(s).slice(0, 200);
}

function shape(r: Resource, row: Row, pii: boolean, fields?: string[]) {
  const wanted = fields?.length ? r.fields.filter((f) => fields.includes(f.key)) : r.fields;
  const out: Record<string, unknown> = { id: row.id };
  for (const f of wanted) out[f.key] = cleanValue(f.key, f.type, row[f.key], pii);
  if (!fields?.length) for (const c of r.computed ?? []) {
    const v = c.fn(row);
    if (v !== null && v !== undefined) out[c.key] = typeof v === "number" ? Math.round(v * 1000) / 1000 : v;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Read-only tools the model can call. Every one is scoped to the signed-in workspace.
// ---------------------------------------------------------------------------------------------
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

async function fetchRows(orgId: number, a: Record<string, unknown>, limit: number) {
  const r = RESOURCE_MAP[String(a.resource ?? "")];
  if (!r) throw new Error(`Resource "${a.resource}" tidak dikenal. Pilihan: ${RESOURCES.map((x) => x.key).join(", ")}`);
  const ok = (d: unknown) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
  let rows = await listRows(orgId, r, { from: ok(a.from) ? (a.from as string) : null, to: ok(a.to) ? (a.to as string) : null, brand: a.brand ? String(a.brand) : null, search: a.search ? String(a.search) : null, limit });
  const where = a.where && typeof a.where === "object" ? (a.where as Record<string, unknown>) : null;
  if (where) {
    const keys = Object.keys(where).filter((k) => r.fields.some((f) => f.key === k));
    rows = rows.filter((row) => keys.every((k) => norm(row[k]) === norm(where[k])));
  }
  return { r, rows };
}

export async function runTool(orgId: number, name: string, a: Record<string, unknown>, pii: boolean): Promise<unknown> {
  try {
    if (name === "get_overview") {
      const t = todayISO();
      const from = typeof a.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.from) ? a.from : monthStart(t);
      const to = typeof a.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.to) ? a.to : monthEnd(t);
      return await buildContext(orgId, from, to, a.brand ? String(a.brand) : null);
    }
    if (name === "query_rows") {
      const { r, rows } = await fetchRows(orgId, a, 5000);
      const limit = Math.min(Math.max(Number(a.limit) || 20, 1), MAX_ROWS);
      const fields = Array.isArray(a.fields) ? (a.fields as unknown[]).map(String) : undefined;
      return { resource: r.key, total_matching: rows.length, returned: Math.min(limit, rows.length), rows: rows.slice(0, limit).map((row) => shape(r, row, pii, fields)), note: pii ? undefined : "nama dan nomor disamarkan" };
    }
    if (name === "aggregate") {
      const { r, rows } = await fetchRows(orgId, a, 20000);
      const metric = ["count", "sum", "avg"].includes(String(a.metric)) ? String(a.metric) : "count";
      const field = String(a.field ?? "");
      if (metric !== "count" && !r.fields.some((f) => f.key === field && ["number", "money", "percent", "rating"].includes(f.type))) throw new Error(`Kolom "${field}" bukan kolom angka di ${r.key}. Kolom angka: ${r.fields.filter((f) => ["number", "money", "percent", "rating"].includes(f.type)).map((f) => f.key).join(", ")}`);
      const gb = String(a.group_by ?? "");
      const month = gb.startsWith("month:");
      const gk = month ? gb.slice(6) : gb;
      if (gb && !r.fields.some((f) => f.key === gk)) throw new Error(`Kolom group_by "${gk}" tidak ada di ${r.key}`);
      const groups = new Map<string, { count: number; sum: number }>();
      for (const row of rows) {
        const key = gb ? (month ? String(row[gk] ?? "").slice(0, 7) : String(row[gk] ?? "").trim()) || "(kosong)" : "semua";
        const g = groups.get(key) ?? { count: 0, sum: 0 };
        g.count++;
        if (metric !== "count") g.sum += n(row[field]);
        groups.set(key, g);
      }
      const list = [...groups.entries()]
        .map(([k, g]) => ({ group: NAME_KEYS.has(gk) && !pii ? initials(k) : k, count: g.count, ...(metric === "sum" ? { sum: Math.round(g.sum) } : metric === "avg" ? { avg: Math.round((g.sum / g.count) * 100) / 100 } : {}) }))
        .sort((x, y) => (metric === "count" ? y.count - x.count : (("sum" in y ? (y as { sum: number }).sum : (y as { avg: number }).avg) ?? 0) - (("sum" in x ? (x as { sum: number }).sum : (x as { avg: number }).avg) ?? 0)))
        .slice(0, 30);
      return { resource: r.key, metric, field: field || undefined, group_by: gb || undefined, rows_considered: rows.length, groups: list };
    }
    return { error: `Alat "${name}" tidak ada` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

const STR = { type: "STRING" };
const DATE = { type: "STRING", description: "Tanggal format YYYY-MM-DD" };
export const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "get_overview",
        description: "Ringkasan lengkap marketing satu periode: KPI iklan, leads, konten, blast, funnel pembiayaan sampai akad, respons chat, per cabang dan CS, campaign, saldo, event, dan insight otomatis. Panggil ini dulu untuk pertanyaan umum atau saran.",
        parameters: { type: "OBJECT", properties: { from: DATE, to: DATE, brand: { ...STR, description: "Nama brand, kosongkan untuk semua" } } },
      },
      {
        name: "query_rows",
        description: "Ambil baris data mentah dari satu tabel (maksimal 40 baris) untuk melihat contoh atau mencari data tertentu.",
        parameters: {
          type: "OBJECT",
          properties: {
            resource: { ...STR, description: `Salah satu: ${RESOURCES.map((r) => r.key).join(", ")}` },
            from: DATE,
            to: DATE,
            brand: STR,
            search: { ...STR, description: "Kata yang dicari di kolom teks" },
            where: { type: "OBJECT", description: "Filter persis, contoh {\"branch\":\"Batam\",\"pipeline_stage\":\"Survei\"}" },
            fields: { type: "ARRAY", items: STR, description: "Kolom yang diambil; kosong berarti semua" },
            limit: { type: "INTEGER", description: "Jumlah baris, maksimal 40" },
          },
          required: ["resource"],
        },
      },
      {
        name: "aggregate",
        description: "Hitung jumlah (count), total (sum), atau rata-rata (avg) dari satu tabel, dikelompokkan per kolom. Gunakan untuk pertanyaan berapa banyak atau berapa total. group_by boleh diawali month: untuk per bulan, contoh month:chat_date.",
        parameters: {
          type: "OBJECT",
          properties: {
            resource: STR,
            metric: { ...STR, description: "count, sum, atau avg" },
            field: { ...STR, description: "Kolom angka untuk sum atau avg" },
            group_by: { ...STR, description: "Kolom pengelompokan, contoh branch, source, pic, month:chat_date" },
            from: DATE,
            to: DATE,
            brand: STR,
            where: { type: "OBJECT" },
          },
          required: ["resource"],
        },
      },
    ],
  },
];

function schemaText() {
  return RESOURCES.map((r) => {
    const cols = r.fields.map((f) => `${f.key}(${f.type === "select" ? "pilihan" : f.type})`).join(", ");
    const comp = (r.computed ?? []).map((c) => c.key).join(", ");
    return `- ${r.key} (${r.label}), kolom tanggal ${r.dateField}: ${cols}${comp ? `; terhitung: ${comp}` : ""}`;
  }).join("\n");
}

function systemText(pii: boolean) {
  return `Kamu adalah analis data dan konsultan digital marketing untuk perusahaan pembiayaan (multifinance) di Indonesia dengan jaminan BPKB dan beberapa cabang. Kamu membantu tim membaca database marketing mereka dan memberi saran.

Hari ini ${todayISO()}. Bulan berjalan ${monthStart(todayISO())} sampai ${monthEnd(todayISO())}; 30 hari terakhir mulai ${addDays(todayISO(), -30)}.

Cara bekerja:
- Untuk angka, JANGAN menebak. Panggil alat get_overview, aggregate, atau query_rows, lalu jawab dari hasilnya. Boleh memanggil beberapa alat berurutan.
- Kamu hanya bisa MEMBACA. Kamu tidak bisa mengubah, menambah, atau menghapus data; kalau diminta, jelaskan langkah yang bisa dilakukan pengguna di aplikasi.
- Sebutkan periode dan sumber angka dalam jawaban. Kalau data kosong atau tidak cukup, katakan terus terang.
- ${pii ? "Nama dan nomor nasabah tersedia, tapi tampilkan seperlunya saja." : "Nama dan nomor nasabah disamarkan (inisial, tiga digit terakhir). Jangan mencoba menebak identitas asli."}
- Saran harus spesifik: siapa, melakukan apa, angka apa yang dipantau. Ini industri yang diawasi OJK: jangan menyarankan klaim seperti pasti cair atau tanpa survei.
- Jawab dalam bahasa Indonesia yang ringkas. Pakai daftar bernomor atau butir; jangan pakai tabel, LaTeX, atau garis pemisah. Tulis panah dengan →. Gunakan **tebal** seperlunya. Isi tabel di database yang boleh kamu baca:
${schemaText()}`;
}

// ---------------------------------------------------------------------------------------------
// Gemini function-calling loop
// ---------------------------------------------------------------------------------------------
interface Part {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: unknown };
  [k: string]: unknown;
}
interface Content {
  role: "user" | "model";
  parts: Part[];
}
export interface ChatTurn {
  role: "user" | "model";
  text: string;
}

const STEP_LABEL: Record<string, string> = { get_overview: "Membaca ringkasan marketing", query_rows: "Membaca baris data", aggregate: "Menghitung agregat" };

export async function chat(orgId: number, history: ChatTurn[]): Promise<{ reply: string; steps: string[] }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new HttpError(503, "Obrolan AI memakai Gemini: GEMINI_API_KEY belum dipasang di server.");
  const used = await chatUsedToday(orgId);
  if (used >= CHAT_DAILY_LIMIT) throw new HttpError(429, `Batas ${CHAT_DAILY_LIMIT} pesan AI per hari sudah tercapai. Coba lagi besok.`);

  const pii = await allowPII(orgId);
  const models = (await geminiCandidates(key)).slice(0, 3);
  const contents: Content[] = history.slice(-12).map((t) => ({ role: t.role, parts: [{ text: t.text.slice(0, 4000) }] }));
  if (!contents.length || contents[contents.length - 1].role !== "user") throw new HttpError(400, "Pesan kosong");

  const started = Date.now();
  const steps: string[] = [];
  let modelIdx = 0;
  for (let step = 0; step < MAX_STEPS; step++) {
    const remainingAtStart = BUDGET_MS - (Date.now() - started);
    if (remainingAtStart < 6000) return { reply: "Pertanyaannya butuh waktu lebih lama dari batas yang saya punya. Coba persempit, misalnya satu cabang atau satu periode.", steps };
    let res: Response | null = null;
    for (; modelIdx < models.length; modelIdx++) {
      try {
        const remaining = BUDGET_MS - (Date.now() - started);
        if (remaining < 4000) break;
        const body = JSON.stringify({
          systemInstruction: { parts: [{ text: systemText(pii) }] },
          contents,
          tools: TOOLS,
          generationConfig: { temperature: 0.7, maxOutputTokens: 4000, thinkingConfig: { thinkingLevel: "low" } },
        });
        const call = (b: string) =>
          fetch(`${GEMINI_BASE}/models/${models[modelIdx]}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, signal: AbortSignal.timeout(Math.min(20_000, remaining)), body: b });
        res = await call(body);
        if (res.status === 400) {
          // maybe this model rejects the thinking option: retry once without it
          const j = JSON.parse(body);
          delete j.generationConfig.thinkingConfig;
          const retry = await call(JSON.stringify(j));
          if (retry.ok) res = retry;
        }
        // 503 "high demand" (free tier): skip straight to the next, lighter model instead of waiting
        // 429 (free tier per-minute limit) is per model: the next, lighter model usually still has room
        if (res.ok || res.status === 401 || res.status === 403 || res.status === 400) break;
      } catch {
        res = null; // timeout or network: try the next model
      }
    }
    if (!res) throw new HttpError(504, "Layanan AI terlalu lama merespons. Coba lagi.");
    if (res.status === 429) throw new HttpError(429, "Jatah gratis Gemini per menit sedang habis. Tunggu sekitar satu menit lalu kirim lagi.");
    if (res.status === 401 || res.status === 403) throw new HttpError(503, "GEMINI_API_KEY tidak valid atau belum diizinkan.");
    if (!res.ok) {
      console.error("gemini chat", res.status, (await res.text()).slice(0, 300));
      throw new HttpError(res.status === 503 ? 503 : 502, res.status === 503 ? "Layanan Gemini sedang ramai. Coba lagi dalam beberapa menit." : "Layanan AI sedang bermasalah. Coba lagi sebentar.");
    }
    const j = (await res.json()) as { candidates?: { content?: Content }[]; promptFeedback?: { blockReason?: string } };
    if (j.promptFeedback?.blockReason) throw new HttpError(422, "AI menolak memproses pertanyaan ini.");
    const content = j.candidates?.[0]?.content;
    const parts = content?.parts ?? [];
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) {
      const reply = parts.map((p) => p.text ?? "").join("").trim();
      if (!reply) throw new HttpError(502, "AI tidak memberi jawaban. Coba ulangi pertanyaannya.");
      await setSetting(`ai:chat:${orgId}:${todayISO()}`, String(used + 1));
      return { reply, steps };
    }
    // echo the model turn back unchanged (it carries signatures the API needs), then answer each call
    contents.push({ role: "model", parts });
    const responses: Part[] = [];
    for (const p of calls) {
      const fc = p.functionCall!;
      steps.push(STEP_LABEL[fc.name] ?? fc.name);
      const result = await runTool(orgId, fc.name, fc.args ?? {}, pii);
      responses.push({ functionResponse: { name: fc.name, response: { result } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  return { reply: "Saya sudah membaca banyak data tapi belum sampai pada jawaban. Coba pertanyaan yang lebih spesifik.", steps };
}
