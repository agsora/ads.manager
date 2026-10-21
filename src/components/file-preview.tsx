"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ExternalLink, FileText, X } from "lucide-react";
import { embedUrl, isImage, thumbUrl, type DriveFileLite } from "@/lib/drive-client";

/** Thumbnail tile: image preview when possible, icon otherwise. */
export function FileThumb({ f, size = 64, onClick }: { f: DriveFileLite; size?: number; onClick?: () => void }) {
  const [broken, setBroken] = useState(false);
  const showImg = (isImage(f.mime, f.name) || f.mime?.startsWith("video/") || f.mime === "application/pdf") && !broken;
  return (
    <button
      type="button"
      onClick={onClick}
      title={f.name}
      className="relative shrink-0 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--accent)]"
      style={{ width: size, height: size }}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbUrl(f.drive_id, size * 3)} alt={f.name} className="h-full w-full object-cover" loading="lazy" onError={() => setBroken(true)} referrerPolicy="no-referrer" />
      ) : (
        <span className="grid h-full w-full place-items-center text-[var(--muted)]">
          <FileText size={size / 3} />
        </span>
      )}
    </button>
  );
}

/** Full-screen style preview with next/previous through the given files. */
export function FileViewer({ files, start = 0, onClose }: { files: DriveFileLite[]; start?: number; onClose: () => void }) {
  const [i, setI] = useState(Math.min(start, files.length - 1));
  const f = files[i];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
      if (e.key === "ArrowRight") setI((x) => Math.min(files.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [files.length, onClose]);
  if (!f) return null;
  const img = isImage(f.mime, f.name);
  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#1f1e1d]/90" onMouseDown={onClose} role="dialog" aria-label={`Preview ${f.name}`}>
      <div className="flex items-center gap-3 px-4 py-3 text-white" onMouseDown={(e) => e.stopPropagation()}>
        <div className="min-w-0 flex-1 truncate text-[14px] font-medium">
          {f.name}
          {files.length > 1 && <span className="ml-2 text-[12px] text-white/60">{i + 1} / {files.length}</span>}
        </div>
        <a href={f.url} target="_blank" rel="noreferrer" className="btn btn-sm !border-white/20 !bg-transparent !text-white hover:!bg-white/10">
          <ExternalLink size={14} /> Buka di Drive
        </a>
        <button className="btn btn-sm !border-white/20 !bg-transparent !text-white hover:!bg-white/10" onClick={onClose} aria-label="Tutup">
          <X size={16} />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4" onMouseDown={(e) => e.stopPropagation()}>
        {files.length > 1 && i > 0 && (
          <button className="absolute left-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25" onClick={() => setI(i - 1)} aria-label="Sebelumnya">
            <ChevronLeft />
          </button>
        )}
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbUrl(f.drive_id, 1600)} alt={f.name} className="max-h-full max-w-full rounded-lg object-contain" referrerPolicy="no-referrer" />
        ) : (
          <iframe key={f.drive_id} src={embedUrl(f.drive_id)} title={f.name} className="h-full w-full max-w-5xl rounded-lg bg-white" allow="autoplay; fullscreen" />
        )}
        {files.length > 1 && i < files.length - 1 && (
          <button className="absolute right-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25" onClick={() => setI(i + 1)} aria-label="Berikutnya">
            <ChevronRight />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
