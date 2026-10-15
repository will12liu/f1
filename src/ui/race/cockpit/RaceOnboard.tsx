// The race view's onboard camera (three.js, loaded when you switch it on): rides with the car you follow.
// Display only: it reads the same view the 2D map draws.
import { useEffect, useRef } from "react";
import type { RaceView } from "../../../engine/race/replay";
import { useTrack } from "../../components/bits";
import { build } from "../drive";
import { raceOnboard } from "./scene";

export default function RaceOnboard({ trackId, km, target, colors, view, follow, code }: { trackId: string; km: number; target: number; colors: string[]; view: RaceView; follow: number; code: string }) {
  const track = useTrack(trackId);
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<ReturnType<typeof raceOnboard> | null>(null);
  useEffect(() => {
    if (!track || !host.current) return;
    try {
      world.current = raceOnboard(host.current, build(track, km, target), trackId, colors);
    } catch {
      world.current = null;
    }
    return () => {
      world.current?.dispose();
      world.current = null;
    };
  }, [track]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    world.current?.draw(view.cars, follow);
  });
  return (
    <div ref={host} className="absolute inset-0 overflow-hidden bg-ink-950">
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 60" preserveAspectRatio="none">
        <path d="M50 -2 V13" stroke="#0b0d10" strokeWidth="2.4" />
        <path d="M2 62 C 8 26, 28 12, 50 12 C 72 12, 92 26, 98 62" fill="none" stroke="#0b0d10" strokeWidth="2.2" />
      </svg>
      <div className="pointer-events-none absolute bottom-4 right-4 rounded-md bg-ink-950/85 px-3 py-1 font-display text-lg font-black uppercase tracking-wider text-white">Onboard · {code}</div>
    </div>
  );
}
