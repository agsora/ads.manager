"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { Modal } from "./resource-form";
import { api, useToast } from "./providers";

/** Reads "-0.9174, 100.3636" (what Google Maps copies when you click the coordinates) into two numbers. */
export function parseCoords(text: string): { lat: number; lng: number } | null {
  const m = /(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)/.exec(text.trim());
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

/** Set the exact map point of one branch by saving it on the branch's latest recap. */
export function PointDialog({ name, recapId, current, onClose, onSaved }: { name: string; recapId: number | null; current: { lat: number; lng: number } | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [lat, setLat] = useState(current ? String(current.lat) : "");
  const [lng, setLng] = useState(current ? String(current.lng) : "");
  const [busy, setBusy] = useState(false);
  const paste = (v: string) => {
    const c = parseCoords(v);
    if (c) {
      setLat(String(c.lat));
      setLng(String(c.lng));
    } else setLat(v);
  };
  const save = async (clear = false) => {
    if (!recapId) return toast("Cabang ini belum punya rekap. Catat rekap dulu, lalu atur titiknya.", "err");
    const la = Number(lat.replace(",", "."));
    const ln = Number(lng.replace(",", "."));
    if (!clear && (!lat.trim() || !lng.trim() || !Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180)) return toast("Latitude harus -90 sampai 90 dan longitude -180 sampai 180", "err");
    setBusy(true);
    try {
      await api(`/api/r/review_stats/${recapId}`, "PUT", clear ? { lat: null, lng: null } : { lat: la, lng: ln });
      toast(clear ? "Titik dihapus, kembali ke perkiraan" : "Titik peta disimpan");
      onSaved();
      onClose();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`Titik peta: ${name}`} subtitle="Isi koordinat agar titik cabang di peta tepat" onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-xl bg-[var(--surface-2)] p-3 text-[12.5px] leading-relaxed text-[var(--ink-2)]">
          <b>Cara mengambil koordinat:</b> buka Google Maps, klik kanan tepat di lokasi kantor cabang, lalu klik angka koordinat paling atas (otomatis tersalin). Tempel di kotak pertama; latitude dan longitude terisi sendiri.
        </div>
        <label className="block">
          <span className="label">Tempel koordinat</span>
          <input className="input" placeholder="-0.9174, 100.3636" onChange={(e) => paste(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Latitude</span>
            <input className="input tnum" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-0.9174" />
          </label>
          <label className="block">
            <span className="label">Longitude</span>
            <input className="input tnum" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="100.3636" />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {current ? (
            <button className="btn btn-sm" disabled={busy} onClick={() => save(true)}>
              Hapus titik
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button className="btn" onClick={onClose}>
              Batal
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={() => save()}>
              <MapPin size={14} /> Simpan titik
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
