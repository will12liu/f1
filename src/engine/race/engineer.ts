// The race engineer: reads the forecast and the race around the car and says what he'd do.
// Pure: the UI shows the calls, the player answers with commands. Trust (Phase 8) will decide whether he
// goes along with a request; until then he always does.
import { COMPOUNDS } from "./model";
import type { RaceState } from "./race";
import type { Forecast } from "./dials";

export interface Call {
  id: string;
  tone: "plan" | "warn" | "info";
  text: string;
}

const tyreName = (c: string) => (COMPOUNDS[c as keyof typeof COMPOUNDS]?.name ?? c).toLowerCase() + "s";

export function engineerCalls(state: RaceState, idx: number, f: Forecast): Call[] {
  const car = state.cars[idx];
  if (car.out || state.lap >= state.laps) return [];
  const out: Call[] = [];
  const left = state.laps - state.lap;
  const pos = state.order.indexOf(idx);

  if (f.nextStop && f.nextStop.lap === state.lap + 1) out.push({ id: "box", tone: "plan", text: car.box ? "Box confirmed for the end of this lap." : `Box this lap for ${tyreName(f.nextStop.compound)}.` });
  else if (f.nextStop) out.push({ id: "plan", tone: "info", text: `Plan: box on lap ${f.nextStop.lap} for ${tyreName(f.nextStop.compound)}.` });

  if (f.tyreLapsLeft < 2.5 && left > 2) out.push({ id: "tyres-gone", tone: "warn", text: "Tyres are finished. Box or lose a lot of time." });
  else if (!f.nextStop && f.tyreLapsLeft < left - 1) out.push({ id: "tyres-short", tone: "warn", text: `These tyres have about ${Math.floor(f.tyreLapsLeft)} laps in them at this pace, ${left} to go.` });

  if (f.fuelShortLap !== null) out.push({ id: "fuel", tone: "warn", text: `Fuel: ${(-f.fuelMargin).toFixed(1)} kg short at this mix. Lean it off or you lift from lap ${f.fuelShortLap}.` });
  if (f.batteryEmptyLap !== null && f.batteryEmptyLap - state.lap <= 3) out.push({ id: "battery", tone: "warn", text: `Battery empty on lap ${f.batteryEmptyLap}. Harvest to build it back.` });

  if (pos > 0) {
    const ahead = state.cars[state.order[pos - 1]];
    const g = car.cum - ahead.cum;
    if (g < 1.0 && state.flag === "green") out.push({ id: "attack", tone: "info", text: f.battery > 0.1 ? `${g.toFixed(1)}s to the car ahead. Overtake mode is there if you want it.` : `${g.toFixed(1)}s to the car ahead, but the battery is flat.` });
  }
  if (pos >= 0 && pos < state.order.length - 1) {
    const behind = state.cars[state.order[pos + 1]];
    const g = behind.cum - car.cum;
    if (g < 0.8 && state.flag === "green") out.push({ id: "defend", tone: "info", text: `Car behind at ${g.toFixed(1)}s.` });
  }
  if (state.flag !== "green") out.push({ id: "flag", tone: "info", text: state.flag === "sc" ? "Safety car. Stops are cheap now." : "VSC. Stops are a bit cheaper." });
  return out;
}

/** Whether the engineer goes along with a request (trust comes in Phase 8). */
export const engineerAccepts = (_trust = 100) => true;
