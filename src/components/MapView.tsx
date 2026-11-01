"use client";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export type Pin = { id: string; lat: number; lng: number; label: string; href?: string; approx?: boolean };

// OpenStreetMap tiles are fine for development. For production traffic use a commercial tile provider (MapTiler, Mapbox, Stadia).
export function MapView({ pins, height = 420, zoom }: { pins: Pin[]; height?: number; zoom?: number }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !el.current) return;
      map = L.map(el.current, { scrollWheelZoom: false, attributionControl: true }).setView([30.03, 31.23], zoom ?? 10);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(map);
      const pts: [number, number][] = [];
      for (const p of pins) {
        pts.push([p.lat, p.lng]);
        if (p.approx) {
          L.circle([p.lat, p.lng], { radius: 500, color: "#C49A3C", fillColor: "#C49A3C", fillOpacity: 0.18, weight: 2 }).addTo(map);
          continue;
        }
        const icon = L.divIcon({ className: "", html: `<span style="display:inline-block;transform:translate(-50%,-50%);white-space:nowrap;background:#06101F;color:#E8D28C;border:1px solid #C49A3C;border-radius:999px;padding:2px 8px;font:600 12px Inter,Cairo,sans-serif">${p.label.replace(/</g, "&lt;")}</span>` });
        const m = L.marker([p.lat, p.lng], { icon }).addTo(map);
        if (p.href) m.on("click", () => (window.location.href = p.href!));
      }
      if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30], maxZoom: 14 });
      else if (pts.length === 1) map.setView(pts[0], zoom ?? 14);
    })();
    return () => { cancelled = true; map?.remove(); };
  }, [pins, zoom]);
  return <div ref={el} style={{ height }} className="z-0 w-full overflow-hidden rounded-xl border border-line" />;
}
