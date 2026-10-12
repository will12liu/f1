// The season: run the next round (qualifying + race), standings, in-season car development.
import { hashString, makeRng } from "../rng";
import { carPace } from "../ratings";
import { dayForms } from "../race/model";
import { qualify } from "../race/qualifying";
import type { Command } from "../race/dials";
import { simRace, type Entry, type RaceInput } from "../race/race";
import type { Circuit, Driver, RaceSummary, Replay, Team, World } from "../types";
import { developCarsAfterRound } from "./development";
import { ensureSeats, managerAfterRound, raceBoost } from "../manager/manager";

export const f1Teams = (w: World) => w.teams.filter((t) => t.series === "F1");
export const driverMap = (w: World) => new Map(w.drivers.map((d) => [d.id, d]));
export const teamMap = (w: World) => new Map(w.teams.map((t) => [t.id, t]));
export const circuitOf = (w: World, id: string): Circuit => {
  const c = w.circuits.find((x) => x.id === id);
  if (!c) throw new Error(`unknown circuit ${id}`);
  return c;
};

export const nextRound = (w: World) => w.calendar.find((r) => !w.results.some((x) => x.round === r.round)) ?? null;
export const seasonOver = (w: World) => nextRound(w) === null;

export const BAN_POINTS = 12;

/** Licence points from the last 12 months (this season, plus last season's later rounds), not yet spent on a ban. */
export function licencePoints(d: Driver, season: number, round: number): number {
  return (d.licence ?? []).filter((x) => !x.spent && (x.season === season || (x.season === season - 1 && x.round > round))).reduce((s, x) => s + x.pts, 0);
}

/** Who races this round: banned drivers are replaced by the team's reserve, or the best driver without an F1 seat. */
export function raceLineup(w: World, round: number): { team: Team; driver: Driver; standIn?: string }[] {
  const dm = driverMap(w);
  const taken = new Set(lineup(w).map((x) => x.driver.id));
  return lineup(w).map((x) => {
    const b = x.driver.bannedFor;
    if (!b || b.season !== w.season || b.round !== round) return x;
    let sub = x.team.reserve ? dm.get(x.team.reserve) : undefined;
    if (!sub || sub.retired || taken.has(sub.id))
      sub = w.drivers.filter((d) => !d.retired && !taken.has(d.id) && d.series !== "F3").sort((a, b2) => b2.ovr - a.ovr)[0];
    if (!sub) return x;
    taken.add(sub.id);
    return { team: x.team, driver: sub, standIn: x.driver.id };
  });
}

/** The two race drivers of every F1 team (skipping any missing id). */
export function lineup(w: World): { team: Team; driver: Driver }[] {
  const dm = driverMap(w);
  return f1Teams(w).flatMap((team) => team.drivers.map((id) => dm.get(id)).filter((d): d is Driver => !!d).map((driver) => ({ team, driver })));
}

export function roundSeed(w: World, round: number) {
  return hashString(`${w.seed}:${w.season}:${round}`);
}

export interface PreparedRound {
  round: number;
  quali: ReturnType<typeof qualify>;
  input: RaceInput; // the race, ready for createRace (live) or simRace
  standIns: { driverId: string; for: string }[];
}

/** Qualifying for the next round and the race input. Doesn't change the world. */
export function prepareNextRound(w: World): PreparedRound | null {
  const r = nextRound(w);
  if (!r) return null;
  const circuit = circuitOf(w, r.circuitId);
  const seed = roundSeed(w, r.round);
  ensureSeats(w);
  const field = raceLineup(w, r.round);
  // the player's people (engineers, simulator) help the team's pace a little; AI teams are unchanged
  const boost = new Map(field.map(({ team }) => [team.id, raceBoost(w, team.id)]));
  const form = dayForms(seed, field.length).map((f, i) => f + boost.get(field[i].team.id)!.form);
  const quali = qualify(
    seed,
    circuit,
    field.map(({ team, driver }, i) => ({ driverId: driver.id, teamId: team.id, car: carPace(team.car, circuit), r: driver.ratings, form: form[i] })),
  );
  const gridPos = new Map(quali.map((q) => [q.driverId, q.pos]));
  const entries: Entry[] = field
    .map(({ team, driver }, i) => ({
      driverId: driver.id,
      teamId: team.id,
      grid: gridPos.get(driver.id)!,
      car: carPace(team.car, circuit),
      reliability: team.car.reliability,
      r: driver.ratings,
      form: form[i],
      pit: boost.get(team.id)!.pit,
      strat: boost.get(team.id)!.strat,
    }))
    .sort((a, b) => a.grid - b.grid);
  const standIns = field.filter((x) => x.standIn).map((x) => ({ driverId: x.driver.id, for: x.standIn! }));
  return { round: r.round, quali, input: { seed, circuit, pitLoss: circuit.pitLoss, entries }, standIns };
}

/** Qualifying + race for the next round. Records the summary and the replay on the world.
 *  `commands` replays a race the player drove live (same input + same commands = same race). */
export function simNextRound(w: World, commands?: Command[]): RaceSummary | null {
  const prep = prepareNextRound(w);
  if (!prep) return null;
  const { quali, input } = prep;
  const r = { round: prep.round };
  const circuit = circuitOf(w, input.circuit.id);
  const seed = input.seed;
  const entries = input.entries;
  const { result, state } = simRace({ ...input, commands });

  const summary: RaceSummary = {
    round: r.round,
    circuitId: circuit.id,
    season: w.season,
    quali: quali.map((q) => ({ driverId: q.driverId, pos: q.pos, q: q.q })),
    pole: quali[0].driverId,
    winner: result.rows[0].driverId,
    fastestLap: result.fastest ? { driverId: entries[result.fastest.idx].driverId, time: result.fastest.time } : { driverId: "", time: 0 },
    classification: result.rows.map((x) => ({
      driverId: x.driverId,
      teamId: x.teamId,
      grid: x.grid,
      pos: x.pos,
      laps: x.laps,
      time: x.time,
      gap: x.gap,
      status: x.status,
      points: x.points,
      pits: x.pits,
      fastest: x.fastest,
      passes: x.passes,
      pens: x.pens.length ? x.pens : undefined,
      pp: x.pp || undefined,
    })),
    sc: result.sc,
    vsc: result.vsc,
    red: result.red || undefined,
    stand_ins: prep.standIns.length ? prep.standIns : undefined,
    overtakes: result.passes,
  };
  const replay: Replay = {
    season: w.season,
    round: r.round,
    circuitId: circuit.id,
    laps: state.laps,
    cars: entries.map((e) => ({ driverId: e.driverId, teamId: e.teamId })),
    grid: entries.map((e) => e.driverId),
    lapEnd: state.lapEnd.map((a) => a.map((t) => Math.round(t * 1000) / 1000)),
    events: state.events,
    flags: state.flagLog.filter((f) => f.flag !== "green") as Replay["flags"],
    stints: state.cars.map((c) => c.stints),
  };
  // licence points; 12 in 12 months = a ban from the next round
  const dm = driverMap(w);
  for (const x of result.rows) {
    if (!x.pp) continue;
    const d = dm.get(x.driverId);
    if (!d) continue;
    (d.licence ??= []).push({ season: w.season, round: r.round, pts: x.pp });
    if (licencePoints(d, w.season, r.round) >= BAN_POINTS) {
      for (const e of d.licence) e.spent = true;
      d.bannedFor = { season: w.season, round: r.round + 1 };
    }
  }
  w.results.push(summary);
  w.replays[r.round] = replay;
  developCarsAfterRound(w, makeRng(seed ^ 0xdee));
  managerAfterRound(w, summary);
  return summary;
}

export interface StandingRow {
  driverId: string;
  teamId: string;
  points: number;
  wins: number;
  podiums: number;
  best: number;
}

export function driverStandings(w: World): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  const dm = driverMap(w);
  for (const d of lineup(w)) rows.set(d.driver.id, { driverId: d.driver.id, teamId: d.team.id, points: 0, wins: 0, podiums: 0, best: 99 });
  for (const res of w.results)
    for (const c of res.classification) {
      const row = rows.get(c.driverId) ?? { driverId: c.driverId, teamId: c.teamId, points: 0, wins: 0, podiums: 0, best: 99 };
      row.points += c.points;
      if (c.pos === 1 && (c.status === "Finished" || c.status === "Lapped")) row.wins++;
      if (c.pos <= 3 && (c.status === "Finished" || c.status === "Lapped")) row.podiums++;
      row.best = Math.min(row.best, c.pos);
      row.teamId = dm.get(c.driverId)?.teamId ?? c.teamId;
      rows.set(c.driverId, row);
    }
  return [...rows.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || a.best - b.best);
}

export function teamStandings(w: World): { teamId: string; points: number; wins: number }[] {
  const rows = new Map(f1Teams(w).map((t) => [t.id, { teamId: t.id, points: 0, wins: 0 }]));
  for (const res of w.results)
    for (const c of res.classification) {
      const row = rows.get(c.teamId);
      if (!row) continue;
      row.points += c.points;
      if (c.pos === 1 && c.status === "Finished") row.wins++;
    }
  return [...rows.values()].sort((a, b) => b.points - a.points || b.wins - a.wins);
}
