import { useState } from "react";
import { useParams } from "react-router-dom";
import { RATING_KEYS } from "../../engine/ratings";
import { ageOf } from "../../engine/season/development";
import type { Driver, RatingKey, Series } from "../../engine/types";
import { FLAGS } from "../../lib/format";
import { useGame } from "../../state/game";
import { DriverLink, Ovr, Section, TeamBar, useMaps } from "../components/bits";

const SHORT: Record<RatingKey, string> = {
  quali: "QUA", pace: "PAC", racecraft: "CRF", overtaking: "OVT", defending: "DEF", starts: "STA", tyres: "TYR", energy: "ENE",
  wet: "WET", consistency: "CON", composure: "CMP", aggression: "AGG", feedback: "TEC", fitness: "FIT",
};

export function Drivers() {
  const { id = "" } = useParams();
  const base = `/g/${id}`;
  const world = useGame((s) => s.world)!;
  const { team } = useMaps(world);
  const [series, setSeries] = useState<Series | "Free">("F1");
  const [sort, setSort] = useState<"ovr" | "pot" | "age" | RatingKey>("ovr");
  const list = world.drivers
    .filter((d) => !d.retired && (series === "Free" ? !d.teamId : d.series === series && d.teamId))
    .sort((a, b) => {
      const v = (d: Driver) => (sort === "ovr" ? d.ovr : sort === "pot" ? d.pot : sort === "age" ? -ageOf(d, world.season) : d.ratings[sort]);
      return v(b) - v(a);
    });
  const th = (k: typeof sort, label: string) => (
    <th className={`num cursor-pointer hover:text-white ${sort === k ? "text-white" : ""}`} onClick={() => setSort(k)}>
      {label}
    </th>
  );
  return (
    <Section
      title="Drivers"
      right={
        <div className="flex gap-1">
          {(["F1", "F2", "F3", "Free"] as const).map((s) => (
            <button key={s} onClick={() => setSeries(s)} className={`btn !px-2.5 !py-1 ${series === s ? "bg-race text-white" : "bg-ink-800 text-slate-300"}`}>
              {s === "Free" ? "Free agents" : s}
            </button>
          ))}
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Driver</th>
              <th>Team</th>
              {th("age", "Age")}
              {th("ovr", "OVR")}
              {th("pot", "POT")}
              {RATING_KEYS.map((k) => th(k, SHORT[k]))}
            </tr>
          </thead>
          <tbody>
            {list.map((d) => (
              <tr key={d.id}>
                <td>
                  <span className="mr-1.5">{FLAGS[d.nat] ?? ""}</span>
                  <DriverLink d={d} base={base} full />
                </td>
                <td>
                  <span className="flex items-center gap-2 text-slate-400">
                    <TeamBar color={team(d.teamId)?.color ?? "#555"} />
                    {team(d.teamId)?.short ?? "-"}
                  </span>
                </td>
                <td className="num">{ageOf(d, world.season)}</td>
                <td className="num"><Ovr v={d.ovr} /></td>
                <td className="num text-slate-400">{d.pot}</td>
                {RATING_KEYS.map((k) => (
                  <td key={k} className="num text-slate-300">{d.ratings[k]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
