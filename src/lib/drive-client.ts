import { api } from "@/components/providers";

export const MAX_FILE = 25 * 1024 * 1024;

export interface DriveFileLite {
  id: number;
  name: string;
  url: string;
  drive_id: string;
  mime: string | null;
  size?: number | null;
  uploaded_by?: string | null;
  created_at?: string;
}

/** Small preview image of a Drive file (works for files shared by link). */
export const thumbUrl = (driveId: string, width = 320) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w${width}`;
/** Embeddable Drive viewer (video, PDF, Office, …). */
export const embedUrl = (driveId: string) => `https://drive.google.com/file/d/${encodeURIComponent(driveId)}/preview`;
export const isImage = (mime: string | null | undefined, name = "") => !!mime?.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);

/** Uploads one file: the server opens a Drive session, the browser sends ~3.5 MB chunks through the server. */
export async function uploadToDrive(resource: string, recordId: number, file: File): Promise<{ name: string }> {
  if (file.size > MAX_FILE) throw new Error("Ukuran file maksimal 25 MB");
  if (!file.size) throw new Error("File kosong");
  const g = await api<{ ticket: string; chunk: number; path: string; name: string }>("/api/drive/grant", "POST", { resource, recordId, filename: file.name, size: file.size, mime: file.type });
  let done: { id: string; url: string; size: number; folderUrl: string } | null = null;
  for (let start = 0; start < file.size; start += g.chunk) {
    const part = file.slice(start, Math.min(file.size, start + g.chunk));
    const r = await fetch(`/api/drive/chunk?ticket=${encodeURIComponent(g.ticket)}&start=${start}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: part });
    const j = (await r.json().catch(() => ({}))) as { error?: string; done?: boolean; id: string; url: string; size: number; folderUrl: string };
    if (!r.ok) throw new Error(j.error ?? "Upload ke Drive gagal");
    if (j.done) done = j;
  }
  if (!done) throw new Error("Upload belum selesai, ulangi");
  await api("/api/drive/register", "POST", { resource, recordId, path: g.path, name: g.name, driveId: done.id, url: done.url, folderUrl: done.folderUrl, mime: file.type, size: done.size });
  return { name: g.name };
}
