import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { TrackFile } from "../../../scripts/lib/tracks";
import { ovrClass } from "../../lib/format";
import type { Driver, Team, World } from "../../engine/types";

export type { TrackFile };

export function TeamBar({ color, className = "" }: { color: string; className?: string }) {
  return <span className={`inline-block w-1 h-4 rounded-sm align-middle ${className}`} style={{ background: color }} />;
}

export function Ovr({ v }: { v: number }) {
  return <span className={`chip ${ovrClass(v)} font-mono`}>{v}</span>;
}

export function DriverLink({ d, base, full = false }: { d: Driver | undefined; base: string; full?: boolean }) {
  if (!d) return <span className="text-slate-500">-</span>;
  return (
    <Link to={`${base}/driver/${d.id}`} className="hover:text-white hover:underline underline-offset-2">
      {full ? `${d.first} ${d.last}` : d.last}
    </Link>
  );
}

const trackCache = new Map<string, Promise<TrackFile>>();
export function loadTrack(id: string): Promise<TrackFile> {
  let p = trackCache.get(id);
  if (!p) {
    p = fetch(`/data/tracks/${id}.json`).then((r) => r.json() as Promise<TrackFile>);
    trackCache.set(id, p);
  }
  return p;
}

export function useTrack(id: string | undefined) {
  const [t, setT] = useState<TrackFile | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    loadTrack(id).then((x) => live && setT(x)).catch(() => live && setT(null));
    return () => {
      live = false;
    };
  }, [id]);
  return t && t.id === id ? t : null;
}

export function TrackOutline({ id, className = "", stroke = "#94a3b8" }: { id: string; className?: string; stroke?: string }) {
  const t = useTrack(id);
  if (!t) return <div className={className} />;
  const pad = 40;
  const d = "M" + t.pts.map((p) => `${p[0]},${p[1]}`).join("L") + "Z";
  return (
    <svg viewBox={`${-pad} ${-pad} ${t.w + pad * 2} ${t.h + pad * 2}`} className={className}>
      <path d={d} fill="none" stroke={stroke} strokeWidth={22} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={t.pts[0][0]} cy={t.pts[0][1]} r={18} fill="#e10600" />
    </svg>
  );
}

export function useMaps(w: World) {
  const drivers = new Map(w.drivers.map((d) => [d.id, d]));
  const teams = new Map(w.teams.map((t) => [t.id, t]));
  return { drivers, teams, team: (id: string | null | undefined): Team | undefined => (id ? teams.get(id) : undefined) };
}

export function Section({ title, right, children, className = "" }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-ink-800">
        <h2 className="font-display text-xl font-bold uppercase tracking-wide text-slate-100">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Readable text colour on a team colour. */
export function onColor(hex: string): string {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? "#08090c" : "#ffffff";
}
