"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Link2, Pencil, RotateCcw } from "lucide-react";
import { Modal } from "./resource-form";
import { FileAttachments } from "./file-attachments";
import { FileThumb, FileViewer } from "./file-preview";
import { Chip } from "./cells";
import { api, useFetch, useToast } from "./providers";
import { isImage, thumbUrl, type DriveFileLite } from "@/lib/drive-client";
import { addDays, diffDays, fmtDate, fmtNum, fmtPct, todayISO } from "@/lib/format";
import type { Row } from "@/lib/resources";

const RESULT_FIELDS = [
  ["reach", "Reach"],
  ["views", "Views"],
  ["likes", "Like"],
  ["comments", "Comment"],
  ["shares", "Share"],
  ["saves", "Saved"],
  ["followers", "Followers saat posting"],
] as const;
const MAX_CHECKS = 8;
const num = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v) || 0);
const er = (r: Record<string, unknown>) => (num(r.followers) ? (num(r.likes) + num(r.comments) + num(r.saves)) / num(r.followers) : null);

/** Detail of one planned content: big preview of its files, upload, quick approval and edit. */
export function ContentDrawer({ row, onClose, onEdit, onChanged }: { row: Row; onClose: () => void; onEdit: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [files, setFiles] = useState<DriveFileLite[]>([]);
  const [view, setView] = useState<number | null>(null);
  const [approval, setApproval] = useState(String(row.approval_status ?? ""));
  const [heroBroken, setHeroBroken] = useState(false);

  // results: editable here, so a content can be reviewed and updated without leaving its detail
  const [cur, setCur] = useState<Row>(row);
  const fromRow = (r: Row): Record<string, string> =>
    Object.fromEntries([["actual_date", String(r.actual_date ?? "").slice(0, 10)], ["post_link", String(r.post_link ?? "")], ...RESULT_FIELDS.map(([k]) => [k, r[k] === null || r[k] === undefined ? "" : String(r[k])])]);
  const [res, setRes] = useState<Record<string, string>>(() => fromRow(row));
  const [saving, setSaving] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [markPosted, setMarkPosted] = useState(row.status !== "Posted");
  const dirty = JSON.stringify(res) !== JSON.stringify(fromRow(cur));
  const { data: all } = useFetch<{ rows: Row[] }>("/api/r/content");

  const saveResults = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { actual_date: res.actual_date || null, post_link: res.post_link || null };
      for (const [k] of RESULT_FIELDS) body[k] = res[k] === "" ? null : res[k];
      if (cur.status !== "Posted" && markPosted) {
        body.status = "Posted";
        if (!res.actual_date) body.actual_date = todayISO();
      }
      const j = await api<{ row: Row }>(`/api/r/content/${row.id}`, "PUT", body);
      setCur(j.row);
      setRes(fromRow(j.row));
      toast("Hasil konten disimpan");
      onChanged();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setSaving(false);
    }
  };
  const pull = async () => {
    setPulling(true);
    try {
      // save a freshly typed link first, then read the numbers from it
      if (res.post_link !== String(cur.post_link ?? "")) await api(`/api/r/content/${row.id}`, "PUT", { post_link: res.post_link || null });
      const r = await api<{ updated: number; failed: { message: string }[] }>("/api/content/metrics", "POST", { ids: [row.id] });
      const j = await api<{ row: Row }>(`/api/r/content/${row.id}`, "GET");
      setCur(j.row);
      setRes(fromRow(j.row));
      toast(r.updated ? "Angka ditarik dari link postingan" : r.failed[0]?.message ?? "Tidak ada angka baru", r.updated ? "ok" : "err");
      if (r.updated) onChanged();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setPulling(false);
    }
  };
  const duplicate = async () => {
    try {
      const copy: Record<string, unknown> = {};
      for (const k of ["brand", "channel", "content_type", "pillar", "campaign", "pic", "caption", "brief_link", "post_time"]) copy[k] = cur[k] ?? null;
      copy.title = `${cur.title} (salinan)`;
      copy.post_date = addDays(String(cur.post_date).slice(0, 10), 7);
      copy.status = "Ide";
      copy.approval_status = "Menunggu review";
      await api("/api/r/content", "POST", copy);
      toast(`Disalin sebagai rencana baru pada ${fmtDate(copy.post_date)}`);
      onChanged();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  const liveEr = er({ ...res });
  const interactions = num(res.likes) + num(res.comments) + num(res.saves);
  // compare with the average of other posted content on the same channel
  const peers = (all?.rows ?? []).filter((r) => r.status === "Posted" && r.channel === cur.channel && r.id !== cur.id).map(er).filter((x): x is number => x !== null);
  const peerAvg = peers.length >= 3 ? peers.reduce((a, b) => a + b, 0) / peers.length : null;
  const base = String(cur.actual_date ?? cur.post_date ?? "").slice(0, 10);
  const days = base ? diffDays(base, todayISO()) : 0;
  const nextMark = Math.floor(days / 7) + 1;
  const nextCheck = cur.status === "Posted" && base && nextMark <= MAX_CHECKS ? { date: addDays(base, nextMark * 7), day: nextMark * 7 } : null;

  const loadFiles = useCallback(async () => {
    try {
      const j = await api<{ files: DriveFileLite[] }>(`/api/drive/files?resource=content&id=${row.id}&scope=record`, "GET");
      setFiles(j.files);
    } catch {
      setFiles([]);
    }
  }, [row.id]);
  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const hero = files.find((f) => isImage(f.mime, f.name)) ?? files[0];
  const setStatus = async (value: string) => {
    try {
      await api(`/api/r/content/${row.id}`, "PUT", { approval_status: value });
      setApproval(value);
      toast(value);
      onChanged();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const meta: [string, unknown][] = [
    ["Tanggal", `${fmtDate(row.post_date)}${row.post_time ? ` · ${row.post_time}` : ""}`],
    ["Brand", row.brand],
    ["Campaign", row.campaign],
    ["Pilar", row.pillar],
    ["Jenis", row.content_type],
    ["PIC", row.pic],
  ];

  return (
    <Modal title={String(row.title ?? "Konten")} onClose={onClose} wide>
      <div className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
        <div>
          {hero ? (
            <button type="button" className="group relative block w-full overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-2)]" onClick={() => setView(files.indexOf(hero))} aria-label="Perbesar preview">
              {isImage(hero.mime, hero.name) && !heroBroken ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbUrl(hero.drive_id, 900)} alt={hero.name} className="max-h-[420px] w-full object-contain" referrerPolicy="no-referrer" onError={() => setHeroBroken(true)} />
              ) : (
                <span className="grid h-56 place-items-center text-[13px] text-[var(--ink-2)]">Klik untuk membuka {hero.name}</span>
              )}
              <span className="absolute bottom-2 right-2 rounded bg-black/55 px-2 py-0.5 text-[11px] text-white opacity-0 transition group-hover:opacity-100">Perbesar</span>
            </button>
          ) : (
            <div className="grid h-56 place-items-center rounded-xl border-2 border-dashed border-[var(--line)] px-6 text-center text-[13px] text-[var(--muted)]">Belum ada desain. Upload di bawah — status otomatis jadi &quot;Desain Selesai&quot;.</div>
          )}
          {files.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <FileThumb key={f.id} f={f} size={56} onClick={() => setView(i)} />
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {cur.channel ? <Chip value={String(cur.channel)} tone="gray" /> : null}
            {cur.status ? <Chip value={String(cur.status)} /> : null}
            {approval ? <Chip value={approval} /> : null}
          </div>
          <dl className="mt-4 grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 text-[13.5px]">
            {meta
              .filter(([, v]) => v !== null && v !== undefined && v !== "")
              .map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-[var(--muted)]">{k}</dt>
                  <dd className="font-medium">{String(v)}</dd>
                </div>
              ))}
          </dl>
          {row.caption ? (
            <div className="mt-4">
              <div className="eyebrow mb-1">Caption / brief</div>
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-[var(--ink-2)]">{String(row.caption)}</p>
            </div>
          ) : null}
          {row.approval_note ? (
            <div className="mt-4 rounded-lg bg-[#f8eed6] px-3 py-2 text-[13px] text-[var(--warning-ink)]">
              <b>Catatan reviewer:</b> {String(row.approval_note)}
            </div>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-2">
            <button className="btn btn-sm" onClick={() => setStatus("Disetujui")}>
              <Check size={13} /> Setujui
            </button>
            <button className="btn btn-sm" onClick={() => setStatus("Perlu revisi")}>
              <RotateCcw size={13} /> Minta revisi
            </button>
            <button className="btn btn-sm" onClick={onEdit}>
              <Pencil size={13} /> Edit rencana
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-[var(--line)] pt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="eyebrow">Hasil & performa</div>
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            {cur.post_link ? (
              <a className="btn btn-sm" href={String(cur.post_link)} target="_blank" rel="noreferrer">
                <ExternalLink size={13} /> Buka postingan
              </a>
            ) : null}
            <button className="btn btn-sm" onClick={pull} disabled={pulling || !(res.post_link || cur.brief_link)} title="Ambil reach, like, comment dari link postingan">
              <Link2 size={13} /> {pulling ? "Menarik…" : "Tarik dari link"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2.5">
            <div className="text-[11.5px] text-[var(--muted)]">Engagement rate</div>
            <div className="serif text-[22px] leading-tight tnum">{fmtPct(liveEr, 2)}</div>
            <div className="text-[11.5px] leading-snug text-[var(--muted)]">
              {liveEr === null ? "isi followers" : peerAvg === null ? "(like+comment+saved) ÷ followers" : liveEr >= peerAvg ? `di atas rata-rata ${cur.channel} (${fmtPct(peerAvg, 2)})` : `di bawah rata-rata ${cur.channel} (${fmtPct(peerAvg, 2)})`}
            </div>
          </div>
          <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2.5">
            <div className="text-[11.5px] text-[var(--muted)]">Total interaksi</div>
            <div className="serif text-[22px] leading-tight tnum">{fmtNum(interactions)}</div>
            <div className="text-[11.5px] text-[var(--muted)]">like + comment + saved</div>
          </div>
          <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2.5">
            <div className="text-[11.5px] text-[var(--muted)]">Reach</div>
            <div className="serif text-[22px] leading-tight tnum">{num(res.reach) ? fmtNum(num(res.reach)) : "–"}</div>
            <div className="text-[11.5px] text-[var(--muted)]">{num(res.reach) && num(res.followers) ? `${fmtPct(num(res.reach) / num(res.followers), 0)} dari followers` : "belum diisi"}</div>
          </div>
          <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2.5">
            <div className="text-[11.5px] text-[var(--muted)]">Cek performa berikutnya</div>
            <div className="serif text-[18px] leading-tight">{nextCheck ? fmtDate(nextCheck.date) : "–"}</div>
            <div className="text-[11.5px] text-[var(--muted)]">{nextCheck ? `hari ke-${nextCheck.day}, pengingat otomatis` : cur.status === "Posted" ? "pengingat selesai" : "mulai setelah tayang"}</div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label" htmlFor="cd-actual">
              Tanggal aktual tayang
            </label>
            <input id="cd-actual" type="date" className="input" value={res.actual_date} onChange={(e) => setRes({ ...res, actual_date: e.target.value })} />
          </div>
          <div className="sm:col-span-1 lg:col-span-3">
            <label className="label" htmlFor="cd-link">
              Link postingan
            </label>
            <input id="cd-link" type="url" className="input" placeholder="https://…" value={res.post_link} onChange={(e) => setRes({ ...res, post_link: e.target.value })} />
          </div>
          {RESULT_FIELDS.map(([k, label]) => (
            <div key={k}>
              <label className="label" htmlFor={`cd-${k}`}>
                {label}
              </label>
              <input id={`cd-${k}`} type="number" inputMode="numeric" min={0} step="1" className="input" value={res[k]} onChange={(e) => setRes({ ...res, [k]: e.target.value })} />
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="btn btn-accent" onClick={saveResults} disabled={saving || (!dirty && !(cur.status !== "Posted" && markPosted))}>
            {saving ? "Menyimpan…" : "Simpan hasil"}
          </button>
          {cur.status !== "Posted" && (
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={markPosted} onChange={(e) => setMarkPosted(e.target.checked)} /> Tandai sudah tayang (Posted)
            </label>
          )}
          {dirty && <span className="text-[12.5px] text-[var(--warning-ink)]">Ada perubahan yang belum disimpan</span>}
          <button className="btn btn-sm ml-auto" onClick={duplicate} title="Buat rencana baru dari konten ini, 7 hari kemudian">
            <Copy size={13} /> Duplikat 7 hari kemudian
          </button>
        </div>
      </div>

      <div className="mt-6 border-t border-[var(--line)] pt-5">
        <div className="eyebrow mb-3">Desain & file</div>
        <FileAttachments
          resource="content"
          recordId={Number(row.id)}
          scope="record"
          onChanged={() => {
            loadFiles();
            onChanged();
          }}
        />
      </div>
      {view !== null && <FileViewer files={files} start={view} onClose={() => setView(null)} />}
    </Modal>
  );
}
