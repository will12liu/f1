// Paddock life: things a driver can buy. Each has a price, a yearly upkeep, and perks (XP, morale, fame).
import type { World } from "../types";
import { careerOf, note } from "./career";

export interface Item {
  id: string;
  name: string;
  blurb: string;
  price: number;
  upkeep: number; // per season
  perks: { xp?: number; morale?: number; fame?: number }; // per weekend
  needs?: number; // fame needed before it's on offer
}

export const ITEMS: Item[] = [
  { id: "rig", name: "Simulator rig at home", blurb: "Laps every evening.", price: 60_000, upkeep: 5_000, perks: { xp: 6 } },
  { id: "trainer", name: "Personal trainer", blurb: "Fitter, sharper, happier.", price: 0, upkeep: 90_000, perks: { xp: 3, morale: 0.5 } },
  { id: "physio", name: "Travelling physio", blurb: "Recover between races.", price: 0, upkeep: 70_000, perks: { morale: 0.6 } },
  { id: "coach", name: "Performance coach", blurb: "Data, video, mindset.", price: 0, upkeep: 160_000, perks: { xp: 8 }, needs: 10 },
  { id: "media", name: "Media team", blurb: "Your social channels, done properly.", price: 0, upkeep: 120_000, perks: { fame: 0.25 }, needs: 15 },
  { id: "flat", name: "City apartment near the factory", blurb: "Less travel, more sleep.", price: 400_000, upkeep: 20_000, perks: { morale: 0.4, xp: 2 } },
  { id: "monaco", name: "Apartment in Monaco", blurb: "Where the paddock lives.", price: 4_500_000, upkeep: 150_000, perks: { fame: 0.3, morale: 0.8 }, needs: 35 },
  { id: "supercar", name: "Supercar", blurb: "Mid-engined, loud, photographed everywhere.", price: 350_000, upkeep: 15_000, perks: { fame: 0.15, morale: 0.3 }, needs: 20 },
  { id: "jet", name: "Share in a private jet", blurb: "No more connecting flights.", price: 2_500_000, upkeep: 400_000, perks: { morale: 1 }, needs: 45 },
  { id: "boat", name: "Boat", blurb: "Summer break sorted.", price: 1_200_000, upkeep: 90_000, perks: { morale: 0.6, fame: 0.1 }, needs: 30 },
];

export function buyItem(w: World, itemId: string): { ok: boolean; msg: string } {
  const c = careerOf(w);
  const it = ITEMS.find((x) => x.id === itemId);
  if (!c || !it) return { ok: false, msg: "" };
  if ((c.owned ?? []).includes(it.id)) return { ok: false, msg: "You already have it." };
  if (it.needs && c.fame < it.needs) return { ok: false, msg: "Not available to you yet." };
  if (c.cash < it.price + it.upkeep / 2) return { ok: false, msg: "You can't afford it." };
  c.cash -= it.price;
  (c.owned ??= []).push(it.id);
  note(w, c, "Life", it.name, `${it.name}: ${it.blurb}`);
  return { ok: true, msg: `${it.name} is yours.` };
}

export function sellItem(w: World, itemId: string): { ok: boolean; msg: string } {
  const c = careerOf(w);
  const it = ITEMS.find((x) => x.id === itemId);
  if (!c || !it || !(c.owned ?? []).includes(it.id)) return { ok: false, msg: "" };
  c.owned = c.owned!.filter((x) => x !== it.id);
  c.cash += it.price * 0.6;
  return { ok: true, msg: it.price ? `Sold for ${Math.round((it.price * 0.6) / 1e3)}K.` : `${it.name} stopped.` };
}

/** Every weekend: upkeep and perks. */
export function shopAfterRound(w: World) {
  const c = careerOf(w);
  if (!c?.owned?.length) return;
  const R = w.calendar.length;
  for (const id of c.owned) {
    const it = ITEMS.find((x) => x.id === id);
    if (!it) continue;
    c.cash -= it.upkeep / R;
    if (it.perks.xp) c.xp += it.perks.xp;
    if (it.perks.morale) c.morale = Math.min(100, (c.morale ?? 60) + it.perks.morale);
    if (it.perks.fame) c.fame = Math.min(100, c.fame + it.perks.fame);
  }
  while (c.xp >= 100) {
    c.xp -= 100;
    c.points++;
  }
}
