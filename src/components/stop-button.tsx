"use client";

import { Ban } from "lucide-react";
import { api, useToast } from "./providers";

/** Selection action: put the chosen rows' numbers on the do-not-contact list. */
export function StopButton({ resource, ids, done }: { resource: "leads" | "contacts"; ids: number[]; done: () => void }) {
  const toast = useToast();
  return (
    <button
      className="btn btn-sm"
      onClick={async () => {
        if (!confirm(`Masukkan ${ids.length} nomor ke Daftar Jangan Dihubungi? Nomor ini tidak akan ikut ekspor blast dan remarketing.`)) return;
        try {
          const r = await api<{ added: number; already: number }>("/api/optouts/mark", "POST", { resource, ids });
          toast(`${r.added} nomor dimasukkan${r.already ? ` · ${r.already} sudah ada` : ""}`);
          done();
        } catch (e) {
          toast((e as Error).message, "err");
        }
      }}
    >
      <Ban size={13} /> Jangan dihubungi
    </button>
  );
}
