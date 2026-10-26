"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText, Image as ImageIcon, Loader2, SendHorizontal, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { api, useToast } from "@/components/providers";

interface AiFile {
  name: string;
  mime: string;
  b64?: string;
  kind: "xlsx" | "csv" | "docx" | "pdf" | "txt" | "svg";
}
interface Msg {
  role: "user" | "model";
  text: string;
  steps?: string[];
  files?: AiFile[];
}
interface Status {
  configured: boolean;
  pii: boolean;
  used: number;
  limit: number;
  canChangePrivacy: boolean;
}

const KEY = "am_ai_chat";
const SUGGESTIONS = [
  "Beri ringkasan kondisi marketing bulan ini dan 3 prioritas minggu ini",
  "Cabang mana yang paling banyak leads tapi paling sedikit akad?",
  "Berapa total biaya iklan per campaign bulan ini, dan mana yang paling boros?",
  "Berapa lead HOT yang belum di-follow up lebih dari 3 hari?",
  "Bagaimana kecepatan respons chat tiap CS bulan ini?",
  "Bandingkan leads per sumber trafik 30 hari terakhir",
  "Export leads bulan ini ke Excel",
  "Buat grafik biaya iklan per bulan 6 bulan terakhir (gambar)",
  "Buat laporan marketing bulan ini dalam PDF dan Word",
];

const blobOf = (f: AiFile) => {
  const bin = atob(f.b64 ?? "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: f.mime });
};
const save = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};
/** Charts come as SVG; draw it on a canvas to hand over a PNG as well. */
const savePng = (f: AiFile) => {
  const url = URL.createObjectURL(blobOf(f));
  const img = new window.Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = 1800;
    c.height = 1040;
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    c.toBlob((b) => b && save(b, f.name.replace(/\.svg$/, ".png")), "image/png");
    URL.revokeObjectURL(url);
  };
  img.src = url;
};

function FileCard({ f }: { f: AiFile }) {
  const gone = !f.b64;
  const preview = useMemo(() => (f.kind === "svg" && f.b64 ? URL.createObjectURL(blobOf(f)) : null), [f]);
  const Icon = f.kind === "svg" ? ImageIcon : f.kind === "xlsx" || f.kind === "csv" ? FileSpreadsheet : FileText;
  const label = { xlsx: "Excel", csv: "CSV", docx: "Word", pdf: "PDF", txt: "Teks", svg: "Gambar grafik" }[f.kind];
  return (
    <div className="mt-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-2.5">
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={f.name} className="mb-2 w-full rounded-lg border border-[var(--line)]" />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Icon size={18} className="text-[var(--accent-ink)]" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">{f.name}</div>
          <div className="text-[11.5px] text-[var(--muted)]">{label}{gone ? " · sudah tidak tersedia, minta AI membuatnya lagi" : ""}</div>
        </div>
        {!gone && (
          <>
            {f.kind === "svg" && (
              <button className="btn btn-sm" onClick={() => savePng(f)}>
                <Download size={14} /> PNG
              </button>
            )}
            <button className="btn btn-sm" onClick={() => save(blobOf(f), f.name)}>
              <Download size={14} /> {f.kind === "svg" ? "SVG" : "Unduh"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Small renderer for the model's answer: paragraphs, bullets, numbered lists, **bold**. */
function Answer({ text }: { text: string }) {
  const clean = (s: string) => s.replace(/\$\\rightarrow\$|\$\\to\$/g, "→").replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1$2");
  const inline = (s: string) =>
    clean(s).split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p.replace(/`/g, "")}</span>));
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const L = list;
    out.push(
      L.ordered ? (
        <ol key={out.length} className="my-1.5 list-decimal space-y-1 pl-5">
          {L.items.map((t, i) => (
            <li key={i}>{inline(t)}</li>
          ))}
        </ol>
      ) : (
        <ul key={out.length} className="my-1.5 list-disc space-y-1 pl-5">
          {L.items.map((t, i) => (
            <li key={i}>{inline(t)}</li>
          ))}
        </ul>
      ),
    );
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || num) {
      const ordered = !!num;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? num)![1]);
      continue;
    }
    flush();
    if (!line.trim() || /^\s*[-_*]{3,}\s*$/.test(line)) continue;
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    out.push(
      h ? (
        <div key={out.length} className="mt-2 font-semibold">
          {inline(h[1])}
        </div>
      ) : (
        <p key={out.length} className="my-1.5">
          {inline(line)}
        </p>
      ),
    );
  }
  flush();
  return <div className="text-[14px] leading-relaxed">{out}</div>;
}

export default function AiPage() {
  const toast = useToast();
  const [st, setSt] = useState<Status | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<Status>("/api/ai/chat", "GET").then(setSt).catch(() => setSt(null));
    try {
      const saved: Msg[] = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      if (Array.isArray(saved)) setMsgs(saved.slice(-30));
    } catch {
      /* optional */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(msgs.slice(-30).map((m) => (m.files ? { ...m, files: m.files.map((f) => ({ ...f, b64: undefined })) } : m)))); // file bytes stay in memory only
    } catch {
      /* optional */
    }
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    const next: Msg[] = [...msgs, { role: "user", text: t }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const r = await api<{ reply: string; steps: string[]; files?: AiFile[]; used: number; limit: number }>("/api/ai/chat", "POST", { messages: next.map((m) => ({ role: m.role, text: m.text })) });
      setMsgs([...next, { role: "model", text: r.reply, steps: [...new Set(r.steps)], files: r.files }]);
      setSt((s) => (s ? { ...s, used: r.used, limit: r.limit } : s));
    } catch (e) {
      toast((e as Error).message, "err");
      setMsgs(next.slice(0, -1)); // let them retry the same question
      setInput(t);
    } finally {
      setBusy(false);
    }
  };

  const togglePii = async () => {
    if (!st) return;
    if (!st.pii && !confirm("Izinkan AI melihat nama dan nomor nasabah? Data ini akan dikirim ke layanan Gemini milik Google saat Anda bertanya. Biarkan mati bila ragu.")) return;
    try {
      const r = await api<{ pii: boolean }>("/api/ai/chat", "PUT", { pii: !st.pii });
      setSt({ ...st, pii: r.pii });
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader eyebrow="Asisten" title="Tanya AI" desc="Tanyakan apa saja tentang data marketing Anda: angka per cabang, campaign, leads, funnel sampai akad, atau minta saran. AI membaca database workspace Anda lewat alat khusus baca (tidak bisa mengubah data), lalu menjawab dari angka yang ia temukan.">
        {msgs.length > 0 && (
          <button className="btn btn-sm" onClick={() => confirm("Hapus percakapan ini?") && setMsgs([])}>
            <Trash2 size={14} /> Hapus percakapan
          </button>
        )}
      </PageHeader>

      {st && !st.configured && (
        <div className="card p-4 text-[13.5px] leading-relaxed text-[var(--ink-2)]">
          <b>Obrolan AI belum aktif.</b> Admin perlu memasang <code>GEMINI_API_KEY</code> (gratis di aistudio.google.com/apikey) di Vercel → Settings → Environment Variables, lalu deploy ulang.
        </div>
      )}

      <div className="card flex min-h-[420px] flex-col p-4 sm:p-5">
        <div className="flex-1 space-y-4" aria-live="polite">
          {msgs.length === 0 && (
            <div>
              <div className="flex items-center gap-2 text-[var(--ink-2)]">
                <Sparkles size={16} className="text-[var(--accent)]" />
                <span className="serif text-[18px]">Coba tanyakan</span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="rounded-xl border border-[var(--line)] px-3 py-2.5 text-left text-[13.5px] leading-snug transition hover:bg-[var(--surface-2)] disabled:opacity-50" onClick={() => send(s)} disabled={busy || !st?.configured}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--ink)] px-4 py-2.5 text-[14px] leading-relaxed text-[#faf9f5]">{m.text}</div>
              </div>
            ) : (
              <div key={i} className="flex gap-3">
                <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-ink)]">
                  <Sparkles size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <Answer text={m.text} />
                  {m.files?.map((f, k) => <FileCard key={k} f={f} />)}
                  {m.steps && m.steps.length > 0 && <div className="mt-1.5 text-[11.5px] text-[var(--muted)]">Sumber: {m.steps.join(" · ")}</div>}
                </div>
              </div>
            ),
          )}
          {busy && (
            <div className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
              <Loader2 size={15} className="animate-spin" /> AI sedang membaca data… biasanya 10 sampai 40 detik
            </div>
          )}
          <div ref={end} />
        </div>

        <form
          className="mt-4 flex items-end gap-2 border-t border-[var(--line)] pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <textarea
            className="input !min-h-[44px] flex-1 resize-none"
            rows={2}
            value={input}
            placeholder="Tulis pertanyaan Anda… (Enter untuk kirim, Shift+Enter baris baru)"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            disabled={busy || !st?.configured}
            aria-label="Pertanyaan untuk AI"
          />
          <button className="btn btn-primary !h-[44px]" disabled={busy || !input.trim() || !st?.configured} aria-label="Kirim">
            <SendHorizontal size={16} />
          </button>
        </form>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 text-[12.5px] leading-relaxed text-[var(--muted)]">
        <div className="flex max-w-xl items-start gap-2">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[var(--good)]" />
          <span>
            {st?.pii ? "AI boleh melihat nama dan nomor nasabah." : "Nama dan nomor nasabah disamarkan sebelum dikirim ke AI (inisial, tiga digit terakhir)."} Jawaban AI adalah masukan; periksa angkanya sebelum bertindak.
            {st?.canChangePrivacy && (
              <>
                {" "}
                <button className="font-semibold text-[var(--accent-ink)] underline" onClick={togglePii}>
                  {st.pii ? "Samarkan kembali" : "Izinkan melihat nama & nomor"}
                </button>
              </>
            )}
          </span>
        </div>
        {st && (
          <span className="tnum">
            {st.used}/{st.limit} pesan hari ini
          </span>
        )}
      </div>
    </div>
  );
}
