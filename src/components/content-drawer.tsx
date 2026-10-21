"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Pencil, RotateCcw } from "lucide-react";
import { Modal } from "./resource-form";
import { FileAttachments } from "./file-attachments";
import { FileThumb, FileViewer } from "./file-preview";
import { Chip } from "./cells";
import { api, useToast } from "./providers";
import { isImage, thumbUrl, type DriveFileLite } from "@/lib/drive-client";
import { fmtDate } from "@/lib/format";
import type { Row } from "@/lib/resources";

/** Detail of one planned content: big preview of its files, upload, quick approval and edit. */
export function ContentDrawer({ row, onClose, onEdit, onChanged }: { row: Row; onClose: () => void; onEdit: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [files, setFiles] = useState<DriveFileLite[]>([]);
  const [view, setView] = useState<number | null>(null);
  const [approval, setApproval] = useState(String(row.approval_status ?? ""));
  const [heroBroken, setHeroBroken] = useState(false);

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
            {row.channel ? <Chip value={String(row.channel)} tone="gray" /> : null}
            {row.status ? <Chip value={String(row.status)} /> : null}
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
