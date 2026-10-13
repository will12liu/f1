// The life-event spreadsheet (data/manual/events.csv) turned into event definitions. One row per reply; the
// event's own columns (from, title, message, when, weight, otherwise, gap) are read from its first row. The
// little languages are kept plain so the sheet can be edited in Numbers, Excel or Google Sheets:
//   when:     conditions joined by commas, all must hold: `won`, `dnf`, `partner`, `fame>10`, `engineer<40` ...
//   effects:  `fame +2, trust -3, engineer +4, cash -20000, xp +25, rival end, rent_home_value -4%`
//   chance:   `0.5` or `0.35 + fame/100` (a sum of numbers and name/number or name*number terms)
import type { Ctx, EvOption, Fx, Rel } from "./events";

export interface EvDef {
  id: string;
  gap: number; // rounds before it can come again
  from?: string; // who texts it (the phone's Messages)
  w: (c: Ctx) => number;
  title: string;
  text: string;
  opts: EvOption[];
}

export const COLUMNS = ["id", "from", "title", "message", "when", "weight", "otherwise", "gap", "reply", "hint", "effects", "chance", "if_it_fails", "worked_text", "failed_text"] as const;
const RELS: Rel[] = ["engineer", "boss", "agent", "mate", "family", "press", "partner", "friend"];
const FLAGS: Record<string, (c: Ctx) => boolean> = {
  won: (c) => c.lastPos === 1,
  podium: (c) => c.lastPos !== null && c.lastPos <= 3,
  points: (c) => c.lastPos !== null && c.lastPos <= 10,
  no_points: (c) => c.lastPos !== null && c.lastPos > 10,
  dnf: (c) => c.lastDnf,
  beat_mate: (c) => c.beatMate === true,
  lost_to_mate: (c) => c.beatMate === false,
  rival: (c) => !!c.rival,
  partner: (c) => !!c.partner,
  single: (c) => !c.partner,
  friend: (c) => !!c.friend,
  rental: (c) => !!c.rental,
  junior: (c) => c.series !== "F1",
  f1: (c) => c.series === "F1",
  f2: (c) => c.series === "F2",
  f3: (c) => c.series === "F3",
  last_round: (c) => c.round === c.rounds,
};
const NUMS: Record<string, (c: Ctx) => number | null> = {
  fame: (c) => c.fame,
  trust: (c) => c.trust,
  morale: (c) => c.morale,
  cash: (c) => c.cash,
  age: (c) => c.age,
  round: (c) => c.round,
  deals: (c) => c.deals,
  position: (c) => c.lastPos,
  grid: (c) => c.lastGrid,
  places_gained: (c) => (c.lastPos !== null && c.lastGrid !== null ? c.lastGrid - c.lastPos : null),
  ...Object.fromEntries(RELS.map((r) => [r, (c: Ctx) => c.rel(r)])),
};
export const WHEN_WORDS = { flags: Object.keys(FLAGS), numbers: Object.keys(NUMS) };
const FX_KEYS = ["fame", "trust", "morale", "cash", "xp"] as const;

/** RFC 4180 CSV: quoted fields with commas, quotes ("") and new lines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = "";
  let q = false;
  const t = text.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"' && t[i + 1] === '"') (f += '"'), i++;
      else if (ch === '"') q = false;
      else f += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") row.push(f), (f = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(f);
      rows.push(row);
      row = [];
      f = "";
    } else f += ch;
  }
  if (f || row.length) row.push(f), rows.push(row);
  return rows.filter((r) => r.some((x) => x.trim()));
}

function parseWhen(s: string, err: (m: string) => void): (c: Ctx) => boolean {
  const parts = s.split(/,|&|\band\b/i).map((x) => x.trim()).filter(Boolean);
  const tests = parts.map((p) => {
    const not = p.startsWith("not ") || p.startsWith("!");
    const body = p.replace(/^not\s+|^!/, "").trim();
    const m = body.match(/^([a-z_]+)\s*(>=|<=|>|<|=)\s*(-?[\d.]+)$/i);
    let t: (c: Ctx) => boolean;
    if (m) {
      const get = NUMS[m[1].toLowerCase()];
      const v = Number(m[3]);
      if (!get) {
        err(`unknown number "${m[1]}" in when (use ${Object.keys(NUMS).join(", ")})`);
        return () => false;
      }
      const op = m[2];
      t = (c) => {
        const x = get(c);
        if (x === null) return false;
        return op === ">" ? x > v : op === "<" ? x < v : op === ">=" ? x >= v : op === "<=" ? x <= v : x === v;
      };
    } else {
      const fl = FLAGS[body.toLowerCase()];
      if (!fl) {
        err(`unknown condition "${body}" in when (use ${Object.keys(FLAGS).join(", ")}, or a comparison like fame>10)`);
        return () => false;
      }
      t = fl;
    }
    return not ? (c: Ctx) => !t(c) : t;
  });
  return (c) => tests.every((t) => t(c));
}

function parseFx(s: string, err: (m: string) => void): Fx {
  const fx: Fx = {};
  for (const part of s.split(",").map((x) => x.trim()).filter(Boolean)) {
    const m = part.match(/^([a-z_]+)\s+([+-]?[\d.]+%?|end|add)$/i);
    if (!m) {
      err(`can't read effect "${part}" (write it like "fame +2" or "cash -20000")`);
      continue;
    }
    const k = m[1].toLowerCase();
    const raw = m[2];
    if (k === "rival") {
      if (raw === "end" || raw === "add") fx.rival = raw;
      else err(`rival takes "end" or "add"`);
      continue;
    }
    const v = Number(raw.replace("%", ""));
    if (!Number.isFinite(v)) {
      err(`"${raw}" isn't a number in "${part}"`);
      continue;
    }
    if ((FX_KEYS as readonly string[]).includes(k)) fx[k as (typeof FX_KEYS)[number]] = v;
    else if ((RELS as string[]).includes(k)) (fx.rel ??= {})[k as Rel] = v;
    else if (k === "rent_home_value") fx.rentVal = -v / 100;
    else err(`unknown effect "${k}" (use ${[...FX_KEYS, ...RELS, "rival", "rent_home_value"].join(", ")})`);
  }
  return fx;
}

function parseChance(s: string, err: (m: string) => void): ((c: Ctx) => number) | undefined {
  if (!s.trim()) return undefined;
  const terms = s.split("+").map((x) => x.trim());
  const fns = terms.map((t) => {
    if (/^-?[\d.]+%?$/.test(t)) {
      const v = Number(t.replace("%", "")) / (t.endsWith("%") ? 100 : 1);
      return () => v;
    }
    const m = t.match(/^([a-z_]+)\s*([/*])\s*([\d.]+)$/i);
    const get = m && NUMS[m[1].toLowerCase()];
    if (!m || !get) {
      err(`can't read chance term "${t}" (write it like 0.5 or 0.3 + boss/200)`);
      return () => 0;
    }
    const k = Number(m[3]);
    return (c: Ctx) => (get(c) ?? 0) * (m[2] === "/" ? 1 / k : k);
  });
  return (c) => Math.max(0, Math.min(1, fns.reduce((a, f) => a + f(c), 0)));
}

/** Parse the sheet. Rows with mistakes are reported (line numbers as the spreadsheet shows them) and skipped. */
export function parseSheet(text: string): { defs: EvDef[]; errors: string[] } {
  const rows = parseCsv(text);
  const errors: string[] = [];
  if (!rows.length) return { defs: [], errors: ["The sheet is empty."] };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: (typeof COLUMNS)[number]) => head.indexOf(name);
  for (const c of ["id", "title", "message", "reply"] as const) if (col(c) < 0) errors.push(`Missing column "${c}" in the header row.`);
  if (errors.length) return { defs: [], errors };
  const get = (r: string[], name: (typeof COLUMNS)[number]) => (col(name) >= 0 ? (r[col(name)] ?? "").trim() : "");
  const defs: EvDef[] = [];
  const bad = new Set<string>();
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const id = get(r, "id");
    const err = (m: string) => {
      errors.push(`Row ${line} (${id || "no id"}): ${m}`);
      bad.add(id);
    };
    if (!id) return err("needs an id");
    let d = defs.find((x) => x.id === id);
    if (!d) {
      if (!get(r, "title") || !get(r, "message")) err("the first row of an event needs a title and a message");
      const when = parseWhen(get(r, "when"), err);
      const wt = Number(get(r, "weight") || "1");
      const other = Number(get(r, "otherwise") || "0");
      const gap = Number(get(r, "gap") || "4");
      if (![wt, other, gap].every(Number.isFinite)) err("weight, otherwise and gap must be numbers");
      d = { id, from: get(r, "from") || undefined, title: get(r, "title"), text: get(r, "message"), gap, w: (c) => (when(c) ? wt : other), opts: [] };
      defs.push(d);
    }
    if (!get(r, "reply")) return err("needs a reply");
    const p = parseChance(get(r, "chance"), err);
    d.opts.push({
      label: get(r, "reply"),
      sub: get(r, "hint"),
      fx: parseFx(get(r, "effects"), err),
      p,
      miss: p ? parseFx(get(r, "if_it_fails"), err) : undefined,
      ok: get(r, "worked_text") || undefined,
      bad: get(r, "failed_text") || undefined,
    });
  });
  for (const d of defs) if (d.opts.length > 3) errors.push(`${d.id}: ${d.opts.length} replies; the phone shows up to 3 well (more still work).`);
  return { defs: defs.filter((d) => !bad.has(d.id) && d.opts.length), errors };
}
