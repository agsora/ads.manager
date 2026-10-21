"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, FolderOpen, Trash2, UploadCloud } from "lucide-react";
import { api, useToast } from "./providers";
import { FileThumb, FileViewer } from "./file-preview";
import { uploadToDrive, type DriveFileLite } from "@/lib/drive-client";
import { fmtDate } from "@/lib/format";

interface Listing {
  enabled: boolean;
  path: string;
  label: string;
  files: DriveFileLite[];
  rootUrl: string | null;
}

const size = (n: number | null | undefined) => (!n ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Files of one record with thumbnails + preview. Uploads go to Drive in a Brand / Campaign / kind folder. */
export function FileAttachments({ resource, recordId, onChanged, scope }: { resource: string; recordId: number; onChanged?: () => void; /** "record": only this record's files; default: everything in its folder */ scope?: "record" }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<Listing | null>(null);
  const [busy, setBusy] = useState("");
  const [drag, setDrag] = useState(false);
  const [view, setView] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Listing>(`/api/drive/files?resource=${resource}&id=${recordId}${scope ? `&scope=${scope}` : ""}`, "GET"));
    } catch {
      setData(null);
    }
  }, [resource, recordId, scope]);
  useEffect(() => {
    load();
  }, [load]);

  const upload = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      setBusy(file.name);
      try {
        const r = await uploadToDrive(resource, recordId, file);
        toast(`${r.name} tersimpan di Drive`);
      } catch (e) {
        toast((e as Error).message, "err");
      }
    }
    setBusy("");
    await load();
    onChanged?.();
  };

  const remove = async (f: DriveFileLite) => {
    if (!confirm(`Hapus "${f.name}"? File dipindah ke sampah Google Drive.`)) return;
    try {
      await api(`/api/drive/files/${f.id}`, "DELETE");
      await load();
      onChanged?.();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  if (!data) return null;
  if (!data.enabled)
    return (
      <div className="rounded-lg border border-dashed border-[var(--line)] p-4 text-[13px] text-[var(--ink-2)]">
        Google Drive belum terhubung.{" "}
        <Link href="/drive" className="font-semibold text-[var(--accent-ink)]">
          Lihat panduan
        </Link>
      </div>
    );

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--ink-2)]">
        <FolderOpen size={14} className="text-[var(--muted)]" />
        <span className="min-w-0 truncate">
          Drive / <b className="font-semibold text-[var(--ink)]">{data.path.split("/").join(" / ")}</b>
        </span>
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files?.length) upload(e.dataTransfer.files);
        }}
        className={`flex flex-wrap items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3 ${drag ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)]"}`}
      >
        <UploadCloud size={18} className="text-[var(--accent-ink)]" />
        <div className="min-w-0 flex-1 text-[13px] text-[var(--ink-2)]">{busy ? `Mengunggah ${busy}…` : "Tarik file ke sini, atau pilih file (maks. 25 MB)"}</div>
        <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => input.current?.click()}>
          Pilih file
        </button>
        <input
          ref={input}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const fl = e.target.files;
            if (fl?.length) upload(Array.from(fl));
            e.target.value = "";
          }}
        />
      </div>
      {data.files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {data.files.map((f, i) => (
            <li key={f.id} className="flex items-center gap-3 rounded-lg border border-[var(--line)] p-2 text-[13px]">
              <FileThumb f={f} size={48} onClick={() => setView(i)} />
              <button type="button" onClick={() => setView(i)} className="min-w-0 flex-1 truncate text-left font-medium hover:text-[var(--accent-ink)]">
                {f.name}
                <span className="mt-0.5 block text-[12px] font-normal text-[var(--muted)]">
                  {size(f.size)} · {f.uploaded_by} · {fmtDate(f.created_at)}
                </span>
              </button>
              <a href={f.url} target="_blank" rel="noreferrer" className="rounded p-1.5 text-[var(--muted)] hover:bg-[var(--surface-2)]" aria-label="Buka di Drive" title="Buka di Drive">
                <ExternalLink size={14} />
              </a>
              <button type="button" className="rounded p-1.5 text-[var(--muted)] hover:bg-[#fbefec] hover:text-[var(--critical-ink)]" onClick={() => remove(f)} aria-label="Hapus file">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {view !== null && <FileViewer files={data.files} start={view} onClose={() => setView(null)} />}
    </div>
  );
}
