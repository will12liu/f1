// Downloads raw sources into data/raw (cached; --force refetches).
//   Jolpica (Ergast successor): calendars, results, qualifying, pit stops, drivers, teams, standings.
//   OpenF1: race sessions, safety-car messages and overtakes (calibration targets).
//   MultiViewer: circuit outlines (x/y), corners, pit-lane loss.
import { CIRCUITS } from "../data/manual/circuits";
import { getJson } from "./lib/cache";

const J = "https://api.jolpi.ca/ergast/f1";
const SEASONS = [2023, 2024, 2025, 2026];

interface Paged {
  MRData: { total: string; limit: string; offset: string; RaceTable?: { Races: unknown[] } };
}

async function paged(path: string, file: string) {
  const first = await getJson<Paged>(`${J}/${path}.json?limit=100&offset=0`, `${file}-0.json`);
  const total = Number(first.MRData.total);
  for (let off = 100; off < total; off += 100) await getJson(`${J}/${path}.json?limit=100&offset=${off}`, `${file}-${off}.json`);
}

async function jolpica() {
  for (const y of SEASONS) {
    const cal = await getJson<{ MRData: { RaceTable: { Races: { round: string; date: string }[] } } }>(`${J}/${y}.json?limit=40`, `jolpica/${y}/races.json`);
    await paged(`${y}/results`, `jolpica/${y}/results`);
    await paged(`${y}/qualifying`, `jolpica/${y}/qualifying`);
    await getJson(`${J}/${y}/drivers.json?limit=100`, `jolpica/${y}/drivers.json`);
    await getJson(`${J}/${y}/constructors.json?limit=40`, `jolpica/${y}/constructors.json`);
    await getJson(`${J}/${y}/driverStandings.json?limit=40`, `jolpica/${y}/driverStandings.json`);
    await getJson(`${J}/${y}/constructorStandings.json?limit=40`, `jolpica/${y}/constructorStandings.json`);
    const today = new Date().toISOString().slice(0, 10);
    for (const r of cal.MRData.RaceTable.Races) {
      if (r.date >= today) continue;
      await getJson(`${J}/${y}/${r.round}/pitstops.json?limit=100`, `jolpica/${y}/pitstops-${r.round}.json`);
    }
    console.log(`jolpica ${y}: ${cal.MRData.RaceTable.Races.length} rounds`);
  }
}

interface Session { session_key: number; circuit_key: number; date_start: string; is_cancelled?: boolean; year: number }

async function openf1() {
  const O = "https://api.openf1.org/v1";
  const now = new Date().toISOString();
  for (const y of [...SEASONS].reverse()) {
    let n = 0;
    for (const kind of ["Race", "Qualifying"]) {
      const sessions = await getJson<Session[]>(`${O}/sessions?year=${y}&session_name=${kind}`, `openf1/${y}/sessions-${kind}.json`, 400);
      for (const s of sessions) {
        if (s.is_cancelled || s.date_start > now) continue;
        const k = s.session_key;
        await getJson(`${O}/session_result?session_key=${k}`, `openf1/${y}/result-${k}.json`, 400, true);
        await getJson(`${O}/drivers?session_key=${k}`, `openf1/${y}/drivers-${k}.json`, 400, true);
        if (kind === "Race") {
          await getJson(`${O}/pit?session_key=${k}`, `openf1/${y}/pit-${k}.json`, 400, true);
          await getJson(`${O}/race_control?session_key=${k}&category=SafetyCar`, `openf1/${y}/sc-${k}.json`, 400, true);
          await getJson(`${O}/overtakes?session_key=${k}`, `openf1/${y}/overtakes-${k}.json`, 400, true);
          n++;
        }
      }
    }
    console.log(`openf1 ${y}: ${n} races`);
  }
}

async function outlines() {
  for (const c of CIRCUITS) {
    let ok = false;
    for (const y of [2026, 2025, 2024, 2023, 2019, 2017]) {
      try {
        await getJson(`https://api.multiviewer.app/api/v1/circuits/${c.key}/${y}`, `tracks/${c.id}.json`, 400);
        ok = true;
        break;
      } catch {
        // try an older year
      }
    }
    if (!ok) ok = await outlineFromOpenF1(c.id, c.key);
    console.log(`track ${c.id}: ${ok ? "ok" : "MISSING"}`);
  }
}

// New circuits MultiViewer doesn't have yet: trace one clean race lap of car positions from OpenF1.
async function outlineFromOpenF1(id: string, key: number): Promise<boolean> {
  const O = "https://api.openf1.org/v1";
  const ss = await getJson<Session[]>(`${O}/sessions?circuit_key=${key}&session_name=Race`, `openf1/circuit-${key}.json`, 500);
  const s = ss.filter((x) => !x.is_cancelled && x.date_start < new Date().toISOString()).at(-1);
  if (!s) return false;
  const laps = await getJson<{ driver_number: number; lap_number: number; date_start: string | null; lap_duration: number | null; is_pit_out_lap: boolean }[]>(
    `${O}/laps?session_key=${s.session_key}`, `openf1/laps-${s.session_key}.json`, 500);
  const clean = laps.filter((l) => l.date_start && l.lap_duration && !l.is_pit_out_lap && l.lap_number > 3);
  const times = clean.map((l) => l.lap_duration!).sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  const lap = clean.find((l) => Math.abs(l.lap_duration! - median) < 0.5);
  if (!lap) return false;
  const t0 = new Date(lap.date_start!);
  const t1 = new Date(t0.getTime() + lap.lap_duration! * 1000);
  const pts = await getJson<{ x: number; y: number }[]>(
    `${O}/location?session_key=${s.session_key}&driver_number=${lap.driver_number}&date>=${t0.toISOString()}&date<=${t1.toISOString()}`,
    `openf1/location-${id}.json`, 500);
  const { writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { RAW } = await import("./lib/cache");
  const xs = pts.filter((p) => p.x || p.y);
  writeFileSync(join(RAW, `tracks/${id}.json`), JSON.stringify({ x: xs.map((p) => p.x), y: xs.map((p) => p.y), rotation: 0, source: "openf1", lapTime: lap.lap_duration }));
  return xs.length > 50;
}

const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
// Jolpica is optional (birth dates, older seasons); it is slow and sometimes unreachable.
if (only.includes("jolpica")) await jolpica().catch((e) => console.warn(`jolpica skipped: ${(e as Error).message}`));
if (!only.length || only.includes("openf1")) await openf1();
if (!only.length || only.includes("tracks")) await outlines();
