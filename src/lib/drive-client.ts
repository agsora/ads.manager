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

const toBase64 = (buf: ArrayBuffer) => {
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Small preview image of a Drive file (works for files shared by link). */
export const thumbUrl = (driveId: string, width = 320) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w${width}`;
/** Embeddable Drive viewer (video, PDF, Office, …). */
export const embedUrl = (driveId: string) => `https://drive.google.com/file/d/${encodeURIComponent(driveId)}/preview`;
export const isImage = (mime: string | null | undefined, name = "") => !!mime?.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);

/** Uploads one file to the record's Drive folder (direct to Apps Script, server proxy for small files as fallback). */
export async function uploadToDrive(resource: string, recordId: number, file: File): Promise<{ name: string }> {
  if (file.size > MAX_FILE) throw new Error("Ukuran file maksimal 25 MB");
  const g = await api<{ grant: string; sig: string; scriptUrl: string; path: string; name: string }>("/api/drive/grant", "POST", { resource, recordId, filename: file.name, size: file.size });
  let res: { id?: string; url?: string; size?: number; folderUrl?: string; error?: string };
  try {
    const r = await fetch(g.scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ grant: g.grant, sig: g.sig, mime: file.type, data: toBase64(await file.arrayBuffer()) }),
    });
    res = await r.json();
  } catch {
    if (file.size > 4 * 1024 * 1024) throw new Error("Upload langsung ke Drive gagal (cek deploy Apps Script: akses 'Siapa saja'). File di atas 4 MB tidak bisa lewat server.");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("resource", resource);
    fd.append("recordId", String(recordId));
    res = await api("/api/drive/proxy", "POST", fd);
  }
  if (res.error || !res.id || !res.url) throw new Error(res.error ?? "Upload gagal");
  await api("/api/drive/register", "POST", { resource, recordId, path: g.path, name: g.name, driveId: res.id, url: res.url, folderUrl: res.folderUrl, mime: file.type, size: res.size ?? file.size });
  return { name: g.name };
}
