"use client";

import { Crosshair, MapPin, ShieldCheck } from "lucide-react";

export type MapPosition = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

export default function LiveMap({
  position,
  projectName,
  locationLabel,
  onLocate,
}: {
  position: MapPosition | null;
  projectName: string;
  locationLabel: string;
  onLocate: () => void;
}) {
  const lat = position?.latitude ?? 58.897;
  const lon = position?.longitude ?? 17.548;
  const delta = 0.012;
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lon-delta}%2C${lat-delta}%2C${lon+delta}%2C${lat+delta}&layer=mapnik&marker=${lat}%2C${lon}`;

  return (
    <section className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white">
      <div className="flex flex-col justify-between gap-4 border-b border-zinc-200 p-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <ShieldCheck className="h-4 w-4" /> GPS endast vid stämpling
          </div>
          <h3 className="mt-2 text-xl font-semibold">{projectName}</h3>
          <p className="mt-1 text-sm text-zinc-500">{locationLabel}</p>
        </div>
        <button onClick={onLocate} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white">
          <Crosshair className="h-4 w-4" /> Hämta position
        </button>
      </div>
      <div className="relative h-72 bg-zinc-100">
        <iframe title="Bynex livekarta" src={mapUrl} className="h-full w-full border-0" loading="lazy" />
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-2xl bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
          <div className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4" /> {position ? "Position verifierad" : "Förhandsposition"}</div>
          <p className="mt-1 text-xs text-zinc-500">{position?.accuracy ? `Noggrannhet ±${Math.round(position.accuracy)} m` : "Geofence 150 m"}</p>
        </div>
      </div>
    </section>
  );
}
