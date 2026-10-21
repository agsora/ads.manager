"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, FileText, FolderOpen, Image as ImageIcon, Trash2, UploadCloud, Video } from "lucide-react";
import { api, useToast } from "./providers";
import { fmtDate } from "@/lib/format";

interface DriveFile {
  id: number;
  name: string;
  url: string;
  mime: string | null;
  size: number | null;
  uploaded_by: string | null;
  created_at: string;
}
interface Listing {
  enabled: boolean;
  path: string;
  label: string;
  files: DriveFile[];
  rootUrl: string | null;
}
interface Grant {
  grant: string;
  sig: string;
  scriptUrl: string;
  path: string;
  name: string;
}

const MAX = 25 * 1024 * 1024;

const toBase64 = (buf: ArrayBuffer) => {
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const size = (n: number | null) => (!n ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function FileIcon({ mime }: { mime: string | null }) {
  const c = "text-[var(--muted)]";
  if (mime?.startsWith("image/")) return <ImageIcon size={16} className={c} />;
  if (mime?.startsWith("video/")) return <Video size={16} className={c} />;
  return <FileText size={16} className={c} />;
}

/** Files of one record: uploads go to Drive in a Brand / Campaign / kind folder. */
export function FileAttachments({ resource, recordId, onChanged }: { resource: string; recordId: number; onChanged?: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<Listing | null>(null);
  const [busy, setBusy] = useState("");
  const [drag, setDrag] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<Listing>(`/api/drive/files?resource=${resource}&id=${recordId}`, "GET"));
    } catch {
      setData(null);
    }
  }, [resource, recordId]);
  useEffect(() => {
    load();
  }, [load]);

  const upload = async (file: File) => {
    if (file.size > MAX) return toast("Ukuran file maksimal 25 MB", "err");
    setBusy(file.name);
    try {
      const g = await api<Grant>("/api/drive/grant", "POST", { resource, recordId, filename: file.name, size: file.size });
      let res: { ok?: boolean; id?: string; url?: string; size?: number; folderUrl?: string; error?: string };
      try {
        const r = await fetch(g.scriptUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ grant: g.grant, sig: g.sig, mime: file.type, data: toBase64(await file.arrayBuffer()) }),
        });
        res = await r.json();
      } catch {
        // the browser could not reach Apps Script directly: small files can go through our server
        if (file.size > 4 * 1024 * 1024) throw new Error("Upload langsung ke Drive gagal (cek deploy Apps Script: akses 'Anyone'). File di atas 4 MB tidak bisa lewat server.");
        const fd = new FormData();
        fd.append("file", file);
        fd.append("resource", resource);
        fd.append("recordId", String(recordId));
        res = await api("/api/drive/proxy", "POST", fd);
      }
      if (res.error || !res.id || !res.url) throw new Error(res.error ?? "Upload gagal");
      await api("/api/drive/register", "POST", { resource, recordId, path: g.path, name: g.name, driveId: res.id, url: res.url, folderUrl: res.folderUrl, mime: file.type, size: res.size ?? file.size });
      toast(`${g.name} tersimpan di Drive`);
      await load();
      onChanged?.();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  };

  const remove = async (f: DriveFile) => {
    if (!confirm(`Hapus "${f.name}"? File dipindah ke sampah Google Drive.`)) return;
    try {
      await api(`/api/drive/files/${f.id}`, "DELETE");
      await load();
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
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) upload(f);
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
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) upload(f);
          }}
        />
      </div>
      {data.files.length > 0 && (
        <ul className="mt-3 divide-y divide-[var(--grid)] rounded-lg border border-[var(--line)]">
          {data.files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
              <FileIcon mime={f.mime} />
              <a href={f.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 flex-1 items-center gap-1.5 truncate font-medium hover:text-[var(--accent-ink)]">
                <span className="truncate">{f.name}</span>
                <ExternalLink size={12} className="shrink-0 opacity-50" />
              </a>
              <span className="hidden shrink-0 text-[12px] text-[var(--muted)] sm:inline">
                {size(f.size)} · {f.uploaded_by} · {fmtDate(f.created_at)}
              </span>
              <button type="button" className="rounded p-1 text-[var(--muted)] hover:bg-[#fbefec] hover:text-[var(--critical-ink)]" onClick={() => remove(f)} aria-label="Hapus file">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
