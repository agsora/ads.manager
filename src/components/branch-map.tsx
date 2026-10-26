"use client";

import { useEffect, useRef } from "react";
import type { FeatureGroup, Map as LMap } from "leaflet";
import "leaflet/dist/leaflet.css";

export interface BranchPoint {
  id: string;
  name: string;
  brand: string;
  region: string;
  lat: number;
  lng: number;
  approx: boolean;
  rating: number | null;
  reviews: number;
  lastDate: string | null;
  mapsLink: string | null;
}

/** Colour by rating: green 4.5+, amber 4.0 to 4.4, red below 4.0, grey when there is no rating yet. */
export const ratingColor = (r: number | null) => (r === null ? "#9a978c" : r >= 4.5 ? "#2f9e5b" : r >= 4 ? "#e0a21a" : "#cf4b3a");

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** OpenStreetMap + Leaflet (free, no API key). One circle per branch: colour = rating, size = number of reviews. */
export function BranchMap({ points, height = 420 }: { points: BranchPoint[]; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const layer = useRef<FeatureGroup | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (dead || !el.current) return;
      if (!map.current) {
        map.current = L.map(el.current, { scrollWheelZoom: false, zoomControl: true }).setView([2.5, 100], 5);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>' }).addTo(map.current);
        map.current.on("focus", () => map.current?.scrollWheelZoom.enable());
        map.current.on("blur", () => map.current?.scrollWheelZoom.disable());
      }
      const m = map.current;
      layer.current?.remove(); // drop the markers of the previous filter
      const group = L.featureGroup().addTo(m);
      layer.current = group;
      const maxReviews = Math.max(1, ...points.map((p) => p.reviews));
      for (const p of points) {
        const color = ratingColor(p.rating);
        const radius = 8 + Math.round((Math.sqrt(p.reviews) / Math.sqrt(maxReviews)) * 12);
        const c = L.circleMarker([p.lat, p.lng], { radius, color: "#ffffff", weight: 2, fillColor: color, fillOpacity: p.approx ? 0.55 : 0.92 }).addTo(group);
        c.bindTooltip(`${esc(p.name)} · ${p.rating ? p.rating.toFixed(1) + "★" : "belum ada rating"}`, { direction: "top", offset: [0, -radius] });
        c.bindPopup(
          `<div style="font:13px/1.45 system-ui,sans-serif;min-width:170px">
            <div style="font-weight:650;font-size:14px">${esc(p.name)}</div>
            <div style="color:#6b6a63">${esc(p.brand)}${p.region && p.region !== "(Tanpa wilayah)" ? " · " + esc(p.region) : ""}</div>
            <div style="margin-top:6px"><b style="color:${color}">${p.rating ? p.rating.toFixed(1) + "★" : "–"}</b> · ${p.reviews.toLocaleString("id-ID")} ulasan</div>
            ${p.lastDate ? `<div style="color:#6b6a63">Dicatat ${esc(p.lastDate)}</div>` : ""}
            ${p.approx ? `<div style="color:#a8741a;margin-top:4px">Perkiraan lokasi (pusat kota). Tambahkan link Maps agar tepat.</div>` : ""}
            ${p.mapsLink ? `<a href="${esc(p.mapsLink)}" target="_blank" rel="noreferrer" style="display:inline-block;margin-top:6px;color:#a34f31;font-weight:600">Buka di Google Maps</a>` : ""}
          </div>`,
        );
      }
      if (points.length) m.fitBounds(group.getBounds().pad(0.25), { maxZoom: 12 });
    })();
    return () => {
      dead = true;
    };
  }, [points]);

  // tear the map down only when the component leaves the page
  useEffect(
    () => () => {
      map.current?.remove();
      map.current = null;
      layer.current = null;
    },
    [],
  );

  return <div ref={el} style={{ height }} className="w-full overflow-hidden rounded-xl border border-[var(--line)]" role="img" aria-label="Peta cabang dan rating" />;
}
