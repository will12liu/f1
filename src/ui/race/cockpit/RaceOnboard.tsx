// The race view's onboard camera. Same generated picture as the lap you drive yourself.
// Display only: it reads the same view the 2D map draws.
import { useEffect, useRef, useState } from "react";
import { CAM_LABEL, nextCam, readCam, saveCam, type DriveCam } from "../assist";
import type { RaceView } from "../../../engine/race/replay";
import { useTrack } from "../../components/bits";
import { build } from "../drive";
import { auroraView } from "../look";

export default function RaceOnboard({ trackId, km, target, colors, view, follow, code }: { trackId: string; km: number; target: number; colors: { color: string; color2?: string; num?: number }[]; view: RaceView; follow: number; code: string }) {
  const [cam, setCam] = useState<DriveCam>(readCam);
  const track = useTrack(trackId);
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<ReturnType<typeof auroraView> | null>(null);
  useEffect(() => {
    if (!track || !host.current) return;
    try {
      world.current = auroraView(host.current, build(track, km, target), "", colors, { map: false });
    } catch {
      world.current = null;
    }
    return () => {
      world.current?.dispose();
      world.current = null;
    };
  }, [track]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    world.current?.draw(
      view.cars.map((c) => ({ idx: c.idx, frac: c.frac, hide: c.pit })),
      follow,
      cam,
      0,
    );
  });
  return (
    <div ref={host} className="absolute inset-0 overflow-hidden bg-ink-950">
      <button onClick={() => setCam((c) => saveCam(nextCam(c)))} title="Change the camera" className="absolute bottom-4 right-4 bg-ink-950 px-3 py-1 font-display text-lg font-black uppercase tracking-wider text-white hover:bg-ink-800">
        {code} · {CAM_LABEL[cam]}
      </button>
    </div>
  );
}
