// The phone: your life off the track. A big handset with apps (Messages, Contacts, Bank, Stocks, Crypto, Homes,
// Garage, Business, Team, Social). Life events arrive in Messages as texts you reply to.
import { useState, type ReactNode } from "react";
import { careerOf, meOf, type CareerState } from "../../engine/career/career";
import { BIZ, bizIncome, CARS, doneThisWeek, followers, homePerks, homePrice, HOMES, money, netWorth, priceOf, rentOf, TICKERS, type LifeState, type Market, type Person } from "../../engine/career/life";
import { ITEMS } from "../../engine/career/shop";
import type { World } from "../../engine/types";
import { useAct } from "../manager/kit";

export type AppId = "home" | "messages" | "contacts" | "bank" | "stocks" | "crypto" | "homes" | "garage" | "business" | "team" | "social";

const G = { stroke: "#fff", strokeWidth: 2.2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;
const APPS: { id: Exclude<AppId, "home">; label: string; color: string; glyph: ReactNode }[] = [
  { id: "messages", label: "Messages", color: "#16a34a", glyph: <path {...G} d="M5 6h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-8l-4 3v-3H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" /> },
  { id: "contacts", label: "Contacts", color: "#475569", glyph: <g {...G}><circle cx="12" cy="9" r="3.5" /><path d="M5 19c1.2-3.2 3.8-4.6 7-4.6s5.8 1.4 7 4.6" /></g> },
  { id: "bank", label: "Bank", color: "#0369a1", glyph: <g {...G}><path d="M4 10h16M6 10v7M10 10v7M14 10v7M18 10v7M3 19h18M12 4l8 4H4z" /></g> },
  { id: "stocks", label: "Stocks", color: "#0f172a", glyph: <path {...G} stroke="#34d399" d="M4 17l5-5 3 3 7-8M15 7h4v4" /> },
  { id: "crypto", label: "Crypto", color: "#d97706", glyph: <g {...G}><path d="M12 3l7.5 4.5v9L12 21l-7.5-4.5v-9z" /><path d="M12 8v8M9.5 10.5h4a1.5 1.5 0 0 1 0 3h-4" /></g> },
  { id: "homes", label: "Homes", color: "#be123c", glyph: <path {...G} d="M4 11l8-6 8 6M6 10v9h12v-9M10 19v-5h4v5" /> },
  { id: "garage", label: "Garage", color: "#ea580c", glyph: <g {...G}><path d="M3 15l2-5h14l2 5v3H3z" /><circle cx="7.5" cy="18" r="1.5" /><circle cx="16.5" cy="18" r="1.5" /></g> },
  { id: "business", label: "Business", color: "#047857", glyph: <g {...G}><rect x="4" y="8" width="16" height="11" rx="1" /><path d="M9 8V6h6v2M4 13h16" /></g> },
  { id: "team", label: "Team", color: "#b91c1c", glyph: <g {...G}><path d="M5 15a7 7 0 0 1 14-2v4H8a3 3 0 0 1-3-2z" /><path d="M12 11h7" /></g> },
  { id: "social", label: "Social", color: "#9d174d", glyph: <g {...G}><rect x="4" y="4" width="16" height="16" rx="4" /><circle cx="12" cy="12" r="3.5" /><circle cx="16.8" cy="7.2" r="0.6" fill="#fff" /></g> },
];
const LEGACY = new Set(["flat", "monaco", "supercar", "boat"]); // old shop items: now homes and cars

export function Icon({ id, size = 64 }: { id: Exclude<AppId, "home">; size?: number }) {
  const a = APPS.find((x) => x.id === id)!;
  return (
    <span className="grid place-items-center rounded-[22%]" style={{ width: size, height: size, background: a.color }}>
      <svg viewBox="0 0 24 24" style={{ width: size * 0.56, height: size * 0.56 }}>
        {a.glyph}
      </svg>
    </span>
  );
}

const pct = (a: number, b: number) => (b ? (a / b - 1) * 100 : 0);
const sign = (x: number) => (x >= 0 ? "+" : "");
const upDown = (x: number) => (x >= 0 ? "text-emerald-400" : "text-rose-400");
const initials = (n: string) => n.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase();
const ROLE: Record<string, [string, string]> = { mum: ["Mum", "#0ea5e9"], dad: ["Dad", "#0ea5e9"], sibling: ["Sibling", "#0ea5e9"], partner: ["Partner", "#e11d48"], friend: ["Paddock friend", "#f59e0b"] };
const STATUS: Record<string, string> = { dating: "Dating", together: "Living together", engaged: "Engaged", married: "Married" };

export function Phone({ world, app, setApp }: { world: World; app: AppId; setApp: (a: AppId) => void }) {
  const c = careerOf(world)!;
  const d = meOf(world)!;
  const L = c.life;
  const act = useAct();
  const team = world.teams.find((t) => t.id === d.teamId);
  const next = world.calendar[world.results.length];
  const badge: Partial<Record<AppId, number>> = { messages: c.event ? 1 : 0, contacts: L?.date ? 1 : 0 };
  const title = APPS.find((a) => a.id === app)?.label;

  return (
    <div className="mx-auto flex flex-col rounded-[3.2rem] border-2 border-ink-600 bg-black p-3" style={{ height: "max(700px, calc(100dvh - 7.5rem))", width: "min(100%, max(420px, calc((100dvh - 7.5rem) * 0.54)))" }}>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2.6rem] bg-ink-950">
        {/* status bar */}
        <div className="relative flex h-12 shrink-0 items-center justify-between px-8 text-base font-semibold text-white">
          <span className="font-display text-xl">R{world.results.length}</span>
          <span className="absolute left-1/2 top-2.5 h-7 w-28 -translate-x-1/2 rounded-full bg-black" />
          <span className="flex items-center gap-2">
            <span className="flex items-end gap-0.5">
              {[5, 8, 11, 14].map((h) => (
                <span key={h} className="w-1 rounded-sm bg-white" style={{ height: h }} />
              ))}
            </span>
            <span className="relative h-3.5 w-7 rounded-[4px] border border-white/70 p-0.5">
              <span className="block h-full rounded-[2px] bg-white" style={{ width: `${Math.max(15, c.morale ?? 60)}%` }} />
            </span>
          </span>
        </div>

        {app !== "home" && (
          <div className="flex shrink-0 items-center gap-3 border-b border-ink-800 px-5 pb-3">
            <button className="font-display text-xl font-bold text-sky-400 hover:text-sky-300" onClick={() => setApp("home")}>
              ‹ Home
            </button>
            <h2 className="ml-auto font-display text-3xl font-black uppercase text-white">{title}</h2>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!L ? (
            <div className="grid h-full place-items-center p-8 text-center text-lg text-slate-400">Setting up your phone…</div>
          ) : app === "home" ? (
            <HomeScreen world={world} c={c} badge={badge} setApp={setApp} teamColor={team?.color ?? "#e10600"} next={next?.circuitId} />
          ) : app === "messages" ? (
            <Messages c={c} L={L} me={d.first} act={act} />
          ) : app === "contacts" ? (
            <Contacts world={world} c={c} L={L} act={act} />
          ) : app === "bank" ? (
            <Bank c={c} L={L} setApp={setApp} />
          ) : app === "stocks" || app === "crypto" ? (
            <Markets c={c} L={L} market={app === "stocks" ? "stock" : "crypto"} act={act} />
          ) : app === "homes" ? (
            <Homes world={world} c={c} L={L} act={act} />
          ) : app === "garage" ? (
            <Garage world={world} c={c} L={L} act={act} />
          ) : app === "business" ? (
            <Business c={c} L={L} act={act} />
          ) : app === "team" ? (
            <Team c={c} act={act} />
          ) : (
            <Social c={c} L={L} handle={d.last.toLowerCase()} name={`${d.first} ${d.last}`} />
          )}
        </div>

        {act.answer?.msg && (
          <button onClick={act.clear} className={`mx-4 mb-2 shrink-0 rounded-2xl px-5 py-3 text-left text-base font-semibold ${act.answer.ok ? "bg-emerald-400 text-ink-950" : "bg-amber-300 text-ink-950"}`}>
            {act.answer.msg}
          </button>
        )}
        <button aria-label="Home" onClick={() => setApp("home")} className="mx-auto mb-2 mt-1 h-1.5 w-36 shrink-0 rounded-full bg-white/80 hover:bg-white" />
      </div>
    </div>
  );
}

type Act = ReturnType<typeof useAct>;

function HomeScreen({ world, c, badge, setApp, teamColor, next }: { world: World; c: CareerState; badge: Partial<Record<AppId, number>>; setApp: (a: AppId) => void; teamColor: string; next?: string }) {
  const d = meOf(world)!;
  const nw = netWorth(c);
  const dock: Exclude<AppId, "home">[] = ["messages", "contacts", "bank", "social"];
  const grid = APPS.filter((a) => !dock.includes(a.id));
  const tile = (id: Exclude<AppId, "home">, label?: boolean) => (
    <button key={id} onClick={() => setApp(id)} className="relative grid justify-items-center gap-1.5 rounded-2xl p-1 hover:bg-white/10">
      <Icon id={id} size={68} />
      {badge[id] ? <span className="absolute right-1 top-0 grid h-7 min-w-7 place-items-center rounded-full bg-race px-1.5 text-sm font-bold text-white">{badge[id]}</span> : null}
      {label && <span className="text-sm font-semibold text-white">{APPS.find((a) => a.id === id)!.label}</span>}
    </button>
  );
  return (
    <div className="relative flex h-full flex-col">
      <div className="pointer-events-none absolute -right-6 top-6 select-none font-display text-[16rem] font-black leading-none" style={{ color: teamColor, opacity: 0.22 }}>
        {d.num}
      </div>
      <div className="relative px-7 pt-6">
        <div className="font-display text-7xl font-black leading-none text-white">{world.season}</div>
        <div className="mt-1 text-lg font-semibold text-slate-300">
          Round {world.results.length} of {world.calendar.length}
          {next ? ` · next: ${next.replace(/_/g, " ")}` : ""}
        </div>
        {c.event && (
          <button onClick={() => setApp("messages")} className="mt-5 flex w-full items-center gap-3 rounded-2xl bg-ink-800/95 p-3 text-left hover:bg-ink-700">
            <Icon id="messages" size={40} />
            <div className="min-w-0">
              <div className="text-sm font-bold uppercase text-slate-400">{c.event.from ?? "Messages"}</div>
              <div className="truncate text-base text-white">{c.event.text}</div>
            </div>
          </button>
        )}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            ["Net worth", money(nw.total)],
            ["Morale", Math.round(c.morale ?? 60)],
            ["Followers", compact(followers(c.fame))],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-ink-900/90 px-3 py-2">
              <div className="text-xs font-bold uppercase text-slate-400">{k}</div>
              <div className="font-display text-2xl font-black text-white">{v}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="relative mt-6 grid grid-cols-3 gap-x-2 gap-y-4 px-5 sm:grid-cols-3">{grid.map((a) => tile(a.id, true))}</div>
      <div className="relative mx-4 mb-3 mt-auto grid grid-cols-4 gap-2 rounded-[1.8rem] bg-ink-800/90 p-3">{dock.map((id) => tile(id))}</div>
    </div>
  );
}
const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K` : String(n));

// ───────── Messages ─────────
function Messages({ c, L, me, act }: { c: CareerState; L: LifeState; me: string; act: Act }) {
  const [open, setOpen] = useState<string | null>(c.event ? (c.event.from ?? "Paddock") : null);
  const threads = new Map<string, { last: string; t: number }>();
  for (const m of L.msgs) threads.set(m.from, { last: m.me ? `You: ${m.text}` : m.text, t: m.t });
  if (c.event) threads.set(c.event.from ?? "Paddock", { last: c.event.text, t: Infinity });
  const order = [...threads.entries()].sort((a, b) => b[1].t - a[1].t);
  if (!open)
    return (
      <div className="divide-y divide-ink-800">
        {order.map(([who, x]) => (
          <button key={who} onClick={() => setOpen(who)} className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-ink-900">
            <Avatar name={who} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-white">{who}</span>
                {x.t === Infinity && <span className="h-3 w-3 rounded-full bg-sky-400" />}
              </div>
              <div className="truncate text-base text-slate-400">{x.last}</div>
            </div>
          </button>
        ))}
        {!order.length && <div className="p-8 text-center text-lg text-slate-500">No messages yet.</div>}
      </div>
    );
  const msgs = L.msgs.filter((m) => m.from === open);
  const pending = c.event && (c.event.from ?? "Paddock") === open ? c.event : null;
  return (
    <div className="flex min-h-full flex-col">
      <button onClick={() => setOpen(null)} className="flex items-center gap-3 border-b border-ink-800 px-5 py-3 text-left hover:bg-ink-900">
        <span className="text-xl text-sky-400">‹</span>
        <Avatar name={open} small />
        <span className="text-lg font-bold text-white">{open}</span>
      </button>
      <div className="flex flex-1 flex-col gap-2 px-4 py-4">
        {msgs.slice(-40).map((m, i) => (
          <Bubble key={i} me={m.me}>
            {m.text}
          </Bubble>
        ))}
        {pending && (
          <Bubble>
            <b className="block">{pending.title}</b>
            {pending.text}
          </Bubble>
        )}
      </div>
      {pending && (
        <div className="sticky bottom-0 grid gap-2 border-t border-ink-800 bg-ink-950 p-3">
          <div className="px-1 text-sm font-bold uppercase text-slate-500">Reply as {me}</div>
          {pending.opts.map((o, i) => (
            <button key={i} disabled={act.busy} onClick={() => act.run("answerEvent", i)} className="rounded-2xl bg-sky-600 px-4 py-3 text-left hover:bg-sky-500">
              <div className="text-lg font-bold leading-tight text-white">{o.label}</div>
              <div className="text-sm text-sky-100">{o.sub}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
function Bubble({ me, children }: { me?: boolean; children: ReactNode }) {
  return <div className={`max-w-[82%] rounded-3xl px-4 py-2.5 text-base leading-snug ${me ? "self-end rounded-br-md bg-sky-600 text-white" : "self-start rounded-bl-md bg-ink-800 text-slate-100"}`}>{children}</div>;
}
function Avatar({ name, small, color }: { name: string; small?: boolean; color?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full font-display font-black text-white ${small ? "h-9 w-9 text-base" : "h-12 w-12 text-xl"}`} style={{ background: color ?? "#334155" }}>
      {initials(name)}
    </span>
  );
}

// ───────── Contacts ─────────
function Contacts({ world, c, L, act }: { world: World; c: CareerState; L: LifeState; act: Act }) {
  const [open, setOpen] = useState<string | null>(null);
  const p = L.people.find((x) => x.id === open);
  if (p) return <PersonPage world={world} c={c} p={p} act={act} back={() => setOpen(null)} />;
  const partner = L.people.find((x) => x.role === "partner");
  const fam = L.people.filter((x) => ["mum", "dad", "sibling"].includes(x.role));
  const friends = L.people.filter((x) => x.role === "friend");
  const d = meOf(world)!;
  const mate = world.drivers.find((x) => x.teamId === d.teamId && x.id !== d.id);
  const teamPeople: [string, string, number][] = [
    ["Race engineer", "engineer", c.rel?.engineer ?? 50],
    ["Team boss", "boss", c.rel?.boss ?? 50],
    ["Agent", "agent", c.rel?.agent ?? 50],
    [mate ? `${mate.first} ${mate.last}` : "Team-mate", "mate", c.rel?.mate ?? 50],
    ["The press", "press", c.rel?.press ?? 50],
  ];
  const row = (x: Person) => (
    <button key={x.id} onClick={() => setOpen(x.id)} className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-ink-900">
      <Avatar name={x.name} color={ROLE[x.role][1]} />
      <div className="min-w-0 flex-1">
        <div className="text-lg font-bold text-white">{x.name}</div>
        <div className="text-sm text-slate-400">{x.status ? STATUS[x.status] : ROLE[x.role][0]}{x.job ? ` · ${x.job}` : ""}</div>
      </div>
      <RelBar v={x.rel} />
    </button>
  );
  return (
    <div className="pb-4">
      <Group title="Partner">
        {partner ? (
          row(partner)
        ) : L.date ? (
          <div className="mx-5 grid gap-3 rounded-2xl bg-ink-900 p-4">
            <div className="flex items-center gap-3">
              <Avatar name={L.date.name} color="#e11d48" />
              <div>
                <div className="text-lg font-bold text-white">{L.date.name}</div>
                <div className="text-sm text-slate-400">{L.date.job}, met at a friend's dinner</div>
              </div>
            </div>
            <button disabled={act.busy} onClick={() => act.run("lifeMeet", true)} className="rounded-xl bg-race py-3 font-display text-xl font-bold uppercase text-white hover:bg-red-500">
              Ask them out
            </button>
          </div>
        ) : (
          <div className="mx-5 flex items-center justify-between gap-3 rounded-2xl bg-ink-900 p-4">
            <span className="text-base text-slate-300">Single.</span>
            <button disabled={act.busy || doneThisWeek(world, "meet")} onClick={() => act.run("lifeMeet")} className="rounded-xl bg-ink-700 px-4 py-2 font-display text-lg font-bold uppercase text-white hover:bg-ink-600 disabled:opacity-40">
              {doneThisWeek(world, "meet") ? "Out already" : "Go out"}
            </button>
          </div>
        )}
      </Group>
      <Group title="Family">{fam.map(row)}</Group>
      <Group title="Paddock friends">{friends.length ? friends.map(row) : <div className="px-5 text-base text-slate-500">None yet.</div>}</Group>
      <Group title="The team">
        {teamPeople.map(([n, k, v]) => (
          <div key={k} className="flex items-center gap-4 px-5 py-2.5">
            <Avatar name={n} small color="#7f1d1d" />
            <div className="flex-1 text-base font-semibold text-white">{n}</div>
            <RelBar v={v} />
          </div>
        ))}
        <div className="px-5 pt-1 text-sm text-slate-500">These move with your replies in Messages.</div>
      </Group>
    </div>
  );
}
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pt-4">
      <div className="px-5 pb-2 text-sm font-bold uppercase tracking-wider text-slate-500">{title}</div>
      {children}
    </section>
  );
}
function RelBar({ v }: { v: number }) {
  return (
    <span className="flex w-24 shrink-0 items-center gap-2">
      <span className="h-2.5 flex-1 rounded-full bg-ink-800">
        <span className="block h-full rounded-full" style={{ width: `${v}%`, background: v >= 65 ? "#34d399" : v >= 35 ? "#facc15" : "#fb7185" }} />
      </span>
      <span className="w-7 text-right text-sm font-bold text-slate-300">{Math.round(v)}</span>
    </span>
  );
}
function PersonPage({ world, c, p, act, back }: { world: World; c: CareerState; p: Person; act: Act; back: () => void }) {
  const first = p.name.split(" ")[0];
  const seen = doneThisWeek(world, p.id);
  const btn = (label: string, sub: string, run: () => void, off = false, tone = "bg-ink-800 hover:bg-ink-700") => (
    <button disabled={act.busy || off} onClick={run} className={`rounded-2xl px-4 py-3 text-left disabled:opacity-40 ${tone}`}>
      <div className="text-lg font-bold text-white">{label}</div>
      <div className="text-sm text-slate-400">{sub}</div>
    </button>
  );
  const fam = ["mum", "dad", "sibling"].includes(p.role);
  return (
    <div className="grid gap-5 p-5">
      <button onClick={back} className="justify-self-start text-lg font-bold text-sky-400">
        ‹ Contacts
      </button>
      <div className="grid justify-items-center gap-2 text-center">
        <span className="grid h-28 w-28 place-items-center rounded-full font-display text-5xl font-black text-white" style={{ background: ROLE[p.role][1] }}>
          {initials(p.name)}
        </span>
        <div className="font-display text-4xl font-black uppercase text-white">{p.name}</div>
        <div className="text-base text-slate-400">
          {p.status ? STATUS[p.status] : ROLE[p.role][0]}
          {p.job ? ` · ${p.job}` : ""}
        </div>
        <div className="w-48">
          <RelBar v={p.rel} />
        </div>
      </div>
      {seen && <div className="text-center text-base text-slate-500">You've seen {first} this weekend.</div>}
      <div className="grid gap-2">
        {btn(p.role === "partner" ? "Date night" : p.role === "friend" ? "Hang out" : "Call", p.role === "partner" ? "$1.5K, a good evening" : p.role === "friend" ? "Talk racing: a little XP" : "A long catch-up", () => act.run("lifePerson", p.id, p.role === "partner" ? "date" : "talk"), seen)}
        {btn("Send a gift", p.role === "partner" ? "$6K" : "$2K", () => act.run("lifePerson", p.id, "gift"), seen)}
        {fam && btn("Send money", "$25K, no questions", () => act.run("lifePerson", p.id, "money"), seen)}
        {p.status === "dating" && btn("Move in together", "After a while, if it's going well", () => act.run("lifePerson", p.id, "movein"), seen)}
        {p.status === "together" && btn("Propose", "A ring: $30K. Are they ready?", () => act.run("lifePerson", p.id, "propose"), seen, "bg-race hover:bg-red-500")}
        {p.status === "engaged" && btn("Get married", `About ${money(120_000 + c.fame * 3_000)}`, () => act.run("lifePerson", p.id, "marry"), seen, "bg-race hover:bg-red-500")}
        {p.role === "partner" && btn("Break up", "Hurts, and the gossip sites notice", () => (act.run("lifePerson", p.id, "breakup"), back()))}
      </div>
    </div>
  );
}

// ───────── Bank ─────────
function Bank({ c, L, setApp }: { c: CareerState; L: LifeState; setApp: (a: AppId) => void }) {
  const nw = netWorth(c);
  const parts: [string, number, string, AppId | null][] = [
    ["Cash", nw.cash, "#38bdf8", null],
    ["Stocks", nw.stocks, "#34d399", "stocks"],
    ["Crypto", nw.crypto, "#f59e0b", "crypto"],
    ["Homes", nw.homes, "#fb7185", "homes"],
    ["Cars", nw.cars, "#fb923c", "garage"],
    ["Businesses", nw.biz, "#10b981", "business"],
  ];
  const pos = parts.reduce((s, p) => s + Math.max(0, p[1]), 0) || 1;
  const net = L.ledger.reduce((s, [, v]) => s + v, 0);
  return (
    <div className="grid gap-6 p-5">
      <div>
        <div className="text-sm font-bold uppercase text-slate-400">Net worth</div>
        <div className="font-display text-6xl font-black text-white">{money(nw.total)}</div>
      </div>
      <div className="flex h-4 overflow-hidden rounded-full bg-ink-800">
        {parts.map(([k, v, col]) => (v > 0 ? <span key={k} style={{ width: `${(v / pos) * 100}%`, background: col }} /> : null))}
      </div>
      <div className="grid gap-1">
        {parts.map(([k, v, col, to]) => (
          <button key={k} disabled={!to} onClick={() => to && setApp(to)} className="flex items-center gap-3 rounded-xl px-2 py-2 text-left enabled:hover:bg-ink-900">
            <span className="h-3 w-3 rounded-full" style={{ background: col }} />
            <span className="flex-1 text-lg text-slate-200">{k}</span>
            <span className={`font-display text-2xl font-bold ${v < 0 ? "text-rose-400" : "text-white"}`}>{money(v)}</span>
            {to && <span className="text-slate-500">›</span>}
          </button>
        ))}
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-bold uppercase text-slate-400">Last weekend, off the track</div>
          <div className={`font-display text-2xl font-bold ${upDown(net)}`}>
            {sign(net)}
            {money(net)}
          </div>
        </div>
        <div className="mt-2 grid gap-1">
          {L.ledger.map(([k, v], i) => (
            <div key={i} className="flex justify-between text-base">
              <span className="text-slate-400">{k}</span>
              <span className={upDown(v)}>{money(v)}</span>
            </div>
          ))}
          {!L.ledger.length && <div className="text-base text-slate-500">Nothing yet. Rent, upkeep and business income show here.</div>}
        </div>
        <div className="mt-3 text-sm text-slate-500">Race pay and sponsors are on the Deals page.</div>
      </div>
    </div>
  );
}

// ───────── Stocks & Crypto ─────────
function Spark({ h, w = 96, hgt = 32, color }: { h: number[]; w?: number; hgt?: number; color: string }) {
  const lo = Math.min(...h);
  const hi = Math.max(...h);
  const pts = h.map((v, i) => `${(i / (h.length - 1)) * w},${hgt - ((v - lo) / (hi - lo || 1)) * (hgt - 4) - 2}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${hgt}`} style={{ width: "100%", maxWidth: w, height: hgt }} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
const fmtP = (p: number) => (p >= 1000 ? p.toLocaleString(undefined, { maximumFractionDigits: 0 }) : p >= 1 ? p.toFixed(2) : p.toFixed(4));

function Markets({ c, L, market, act }: { c: CareerState; L: LifeState; market: Market; act: Act }) {
  const [open, setOpen] = useState<string | null>(null);
  const list = TICKERS.filter((t) => t.market === market);
  const held = list.reduce((s, t) => s + (L.hold[t.sym]?.units ?? 0) * priceOf(L, t.sym), 0);
  const cost = list.reduce((s, t) => s + (L.hold[t.sym]?.cost ?? 0), 0);
  const tk = list.find((t) => t.sym === open);
  const accent = market === "stock" ? "#34d399" : "#f59e0b";
  if (tk) {
    const h = L.prices[tk.sym];
    const p = priceOf(L, tk.sym);
    const wkCh = pct(p, h[h.length - 2]);
    const hold = L.hold[tk.sym];
    const val = (hold?.units ?? 0) * p;
    const amounts = [10_000, 100_000, 1_000_000];
    return (
      <div className="grid gap-5 p-5">
        <button onClick={() => setOpen(null)} className="justify-self-start text-lg font-bold text-sky-400">
          ‹ {market === "stock" ? "Stocks" : "Crypto"}
        </button>
        <div>
          <div className="font-display text-2xl font-bold text-slate-400">{tk.sym}</div>
          <div className="font-display text-4xl font-black uppercase text-white">{tk.name}</div>
          <div className="text-base text-slate-400">{tk.what}</div>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="font-display text-6xl font-black text-white">{fmtP(p)}</span>
          <span className={`font-display text-2xl font-bold ${upDown(wkCh)}`}>
            {sign(wkCh)}
            {wkCh.toFixed(1)}% this weekend
          </span>
        </div>
        <div className="rounded-2xl bg-ink-900 p-3">
          <Spark h={h} w={400} hgt={160} color={pct(p, h[0]) >= 0 ? "#34d399" : "#fb7185"} />
          <div className="mt-1 flex justify-between text-sm text-slate-500">
            <span>{h.length} weekends ago</span>
            <span className={upDown(pct(p, h[0]))}>
              {sign(pct(p, h[0]))}
              {pct(p, h[0]).toFixed(0)}%
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-ink-900 p-3">
            <div className="text-sm font-bold uppercase text-slate-400">You own</div>
            <div className="font-display text-3xl font-black text-white">{money(val)}</div>
          </div>
          <div className="rounded-2xl bg-ink-900 p-3">
            <div className="text-sm font-bold uppercase text-slate-400">Gain</div>
            <div className={`font-display text-3xl font-black ${upDown(val - (hold?.cost ?? 0))}`}>{hold ? `${sign(val - hold.cost)}${money(val - hold.cost)}` : "-"}</div>
          </div>
        </div>
        <div className="grid gap-2">
          <div className="text-sm font-bold uppercase text-slate-400">Buy · bank {money(c.cash)}</div>
          <div className="grid grid-cols-4 gap-2">
            {amounts.map((a) => (
              <button key={a} disabled={act.busy || c.cash < a} onClick={() => act.run("lifeTrade", tk.sym, a)} className="rounded-xl bg-emerald-600 py-3 font-display text-xl font-bold text-white hover:bg-emerald-500 disabled:opacity-35">
                {money(a)}
              </button>
            ))}
            <button disabled={act.busy || c.cash < 100} onClick={() => act.run("lifeTrade", tk.sym, c.cash)} className="rounded-xl bg-emerald-800 py-3 font-display text-xl font-bold text-white hover:bg-emerald-700 disabled:opacity-35">
              Max
            </button>
          </div>
          <div className="mt-2 text-sm font-bold uppercase text-slate-400">Sell</div>
          <div className="grid grid-cols-4 gap-2">
            {amounts.map((a) => (
              <button key={a} disabled={act.busy || val < a} onClick={() => act.run("lifeTrade", tk.sym, -a)} className="rounded-xl bg-ink-700 py-3 font-display text-xl font-bold text-white hover:bg-ink-600 disabled:opacity-35">
                {money(a)}
              </button>
            ))}
            <button disabled={act.busy || !hold} onClick={() => act.run("lifeTrade", tk.sym, -1e15)} className="rounded-xl bg-rose-700 py-3 font-display text-xl font-bold text-white hover:bg-rose-600 disabled:opacity-35">
              All
            </button>
          </div>
          <div className="text-sm text-slate-500">Fee {market === "stock" ? "0.5%" : "1.5%"} on each trade. Prices move once a race weekend.</div>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="px-5 py-4" style={{ background: market === "crypto" ? "#1c1305" : undefined }}>
        <div className="text-sm font-bold uppercase text-slate-400">Your {market === "stock" ? "portfolio" : "coins"}</div>
        <div className="font-display text-5xl font-black text-white">{money(held)}</div>
        {cost > 0 && (
          <div className={`text-lg font-semibold ${upDown(held - cost)}`}>
            {sign(held - cost)}
            {money(held - cost)} ({sign(held - cost)}
            {pct(held, cost).toFixed(1)}%)
          </div>
        )}
        {market === "crypto" && <div className="mt-2 text-sm text-amber-300">Crypto swings hard: a coin can halve in a weekend.</div>}
      </div>
      <div className="divide-y divide-ink-800">
        {list.map((t) => {
          const h = L.prices[t.sym];
          const p = priceOf(L, t.sym);
          const ch = pct(p, h[h.length - 2]);
          const own = L.hold[t.sym];
          return (
            <button key={t.sym} onClick={() => setOpen(t.sym)} className="grid w-full grid-cols-[1fr_80px_auto] items-center gap-3 px-5 py-3.5 text-left hover:bg-ink-900">
              <div className="min-w-0">
                <div className="font-display text-2xl font-black text-white">{t.sym}</div>
                <div className="truncate text-sm text-slate-400">{own ? `You own ${money(own.units * p)}` : t.name}</div>
              </div>
              <Spark h={h} w={80} hgt={30} color={pct(p, h[0]) >= 0 ? accent : "#fb7185"} />
              <div className="text-right">
                <div className="font-display text-xl font-bold text-white">{fmtP(p)}</div>
                <div className={`rounded-md px-2 text-sm font-bold ${ch >= 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>
                  {sign(ch)}
                  {ch.toFixed(1)}%
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ───────── Homes, Garage, Business, Team ─────────
function Card2({ title, sub, right, children }: { title: string; sub?: string; right?: ReactNode; children?: ReactNode }) {
  return (
    <div className="grid gap-3 rounded-2xl bg-ink-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-2xl font-black uppercase leading-tight text-white">{title}</div>
          {sub && <div className="text-sm text-slate-400">{sub}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}
const sbtn = (tone = "bg-ink-700 hover:bg-ink-600") => `rounded-xl px-3 py-2 font-display text-lg font-bold uppercase text-white disabled:opacity-35 ${tone}`;
const perkText = (p: { morale?: number; fame?: number; xp?: number }) => [p.morale ? `+${p.morale.toFixed(1)} morale` : "", p.fame ? `+${p.fame.toFixed(2)} fame` : "", p.xp ? `+${Math.round(p.xp)} XP` : ""].filter(Boolean).join(" · ") + " a weekend";
const Shelf = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="grid gap-3">
    <div className="text-sm font-bold uppercase tracking-wider text-slate-500">{title}</div>
    {children}
  </div>
);

function Homes({ world, c, L, act }: { world: World; c: CareerState; L: LifeState; act: Act }) {
  return (
    <div className="grid gap-6 p-5">
      <Shelf title="Yours">
        {L.homes.map((o) => {
          const def = HOMES.find((h) => h.key === o.key)!;
          const gain = o.value - o.paid;
          return (
            <Card2
              key={o.id}
              title={def.name}
              sub={o.rented ? `Rented out · ${money(rentOf(o))} a weekend` : `You live here · ${perkText(homePerks(o))}`}
              right={
                <div className="text-right">
                  <div className="font-display text-2xl font-black text-white">{money(o.value)}</div>
                  <div className={`text-sm font-semibold ${upDown(gain)}`}>
                    {sign(gain)}
                    {money(gain)}
                  </div>
                </div>
              }
            >
              <div className="flex items-center gap-1.5 text-sm text-slate-400">
                Renovated
                {[0, 1, 2].map((k) => (
                  <span key={k} className={`h-2.5 w-6 rounded-full ${k < (o.reno ?? 0) ? "bg-emerald-400" : "bg-ink-700"}`} />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button disabled={act.busy} className={sbtn()} onClick={() => act.run("lifeHome", o.id, "rent")}>
                  {o.rented ? "Move back in" : "Rent it out"}
                </button>
                <button disabled={act.busy || (o.reno ?? 0) >= 3} className={sbtn()} onClick={() => act.run("lifeHome", o.id, "reno")}>
                  Renovate {money(o.value * 0.12)}
                </button>
                <button disabled={act.busy || !!o.rented || doneThisWeek(world, "party")} className={sbtn("bg-race hover:bg-red-500")} onClick={() => act.run("lifeHome", o.id, "party")}>
                  Party {money(def.party)}
                </button>
                <button disabled={act.busy} className={sbtn()} onClick={() => act.run("lifeSell", "home", o.id)}>
                  Sell
                </button>
              </div>
            </Card2>
          );
        })}
        {!L.homes.length && <div className="text-base text-slate-500">You rent a room. Buy a place: live in it for the perks, or rent it out for income.</div>}
      </Shelf>
      <Shelf title="For sale">
        {HOMES.map((h) => {
          const price = homePrice(L, h.key);
          const locked = !!h.needs && c.fame < h.needs;
          return (
            <Card2 key={h.key} title={h.name} sub={`${h.where} · ${perkText(h.perks)}`} right={<div className="font-display text-2xl font-black text-white">{money(price)}</div>}>
              <button disabled={act.busy || locked || c.cash < price} className={sbtn("bg-race hover:bg-red-500")} onClick={() => act.run("lifeBuy", "home", h.key)}>
                {locked ? `Needs fame ${h.needs}` : c.cash < price ? "Can't afford it" : "Buy"}
              </button>
            </Card2>
          );
        })}
      </Shelf>
    </div>
  );
}

function Garage({ world, c, L, act }: { world: World; c: CareerState; L: LifeState; act: Act }) {
  return (
    <div className="grid gap-6 p-5">
      <Shelf title="In the garage">
        {L.cars.map((o) => {
          const def = CARS.find((h) => h.key === o.key)!;
          return (
            <Card2 key={o.id} title={def.name} sub={perkText(def.perks)} right={<div className="text-right"><div className="font-display text-2xl font-black text-white">{money(o.value)}</div><div className={`text-sm font-semibold ${upDown(o.value - o.paid)}`}>{sign(o.value - o.paid)}{money(o.value - o.paid)}</div></div>}>
              <div className="grid grid-cols-2 gap-2">
                <button disabled={act.busy || doneThisWeek(world, "drive")} className={sbtn("bg-race hover:bg-red-500")} onClick={() => act.run("lifeCarDrive", o.id)}>
                  Take it out
                </button>
                <button disabled={act.busy} className={sbtn()} onClick={() => act.run("lifeSell", "car", o.id)}>
                  Sell
                </button>
              </div>
            </Card2>
          );
        })}
        {!L.cars.length && <div className="text-base text-slate-500">Empty. The team lends you a road car, but it's not yours.</div>}
      </Shelf>
      <Shelf title="Dealer">
        {CARS.map((h) => {
          const locked = !!h.needs && c.fame < h.needs;
          return (
            <Card2 key={h.key} title={h.name} sub={`${h.what} · ${perkText(h.perks)}`} right={<div className="font-display text-2xl font-black text-white">{money(h.price)}</div>}>
              <button disabled={act.busy || locked || c.cash < h.price} className={sbtn("bg-race hover:bg-red-500")} onClick={() => act.run("lifeBuy", "car", h.key)}>
                {locked ? `Needs fame ${h.needs}` : c.cash < h.price ? "Can't afford it" : "Buy"}
              </button>
            </Card2>
          );
        })}
      </Shelf>
    </div>
  );
}

function Business({ c, L, act }: { c: CareerState; L: LifeState; act: Act }) {
  return (
    <div className="grid gap-6 p-5">
      <Shelf title="Yours">
        {L.biz.map((b) => {
          const def = BIZ.find((x) => x.key === b.key)!;
          return (
            <Card2 key={b.key} title={def.name} sub={`Level ${b.level} · about ${money(bizIncome(b, c.fame))} a weekend`}>
              <div className="grid grid-cols-2 gap-2">
                <button disabled={act.busy || b.level >= 3} className={sbtn("bg-emerald-700 hover:bg-emerald-600")} onClick={() => act.run("lifeBizUp", b.key)}>
                  {b.level >= 3 ? "Maxed" : `Expand ${money(def.price * 0.6 * b.level)}`}
                </button>
                <button disabled={act.busy} className={sbtn()} onClick={() => act.run("lifeSell", "biz", b.key)}>
                  Sell {money(b.paid * 0.8)}
                </button>
              </div>
            </Card2>
          );
        })}
        {!L.biz.length && <div className="text-base text-slate-500">Nothing yet. A business pays every weekend, and more as you get famous.</div>}
      </Shelf>
      <Shelf title="Opportunities">
        {BIZ.filter((b) => !L.biz.some((x) => x.key === b.key)).map((b) => {
          const locked = !!b.needs && c.fame < b.needs;
          return (
            <Card2 key={b.key} title={b.name} sub={`${b.what} · now about ${money(b.income(c.fame))} a weekend`} right={<div className="font-display text-2xl font-black text-white">{money(b.price)}</div>}>
              <button disabled={act.busy || locked || c.cash < b.price} className={sbtn("bg-race hover:bg-red-500")} onClick={() => act.run("lifeBuy", "biz", b.key)}>
                {locked ? `Needs fame ${b.needs}` : c.cash < b.price ? "Can't afford it" : "Buy"}
              </button>
            </Card2>
          );
        })}
      </Shelf>
    </div>
  );
}

function Team({ c, act }: { c: CareerState; act: Act }) {
  const owned = new Set(c.owned ?? []);
  const items = ITEMS.filter((it) => !LEGACY.has(it.id) || owned.has(it.id));
  return (
    <div className="grid gap-3 p-5">
      <div className="text-base text-slate-400">Your own people and kit. Each costs a yearly fee and helps every weekend.</div>
      {items.map((it) => {
        const have = owned.has(it.id);
        const locked = !!it.needs && c.fame < it.needs;
        return (
          <Card2 key={it.id} title={it.name} sub={`${it.blurb} ${perkText(it.perks)}`} right={have ? <span className="rounded-md bg-emerald-400 px-2 py-0.5 font-display text-base font-bold uppercase text-ink-950">Yours</span> : undefined}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-base text-slate-300">
                {it.price ? `${money(it.price)} + ` : ""}
                {money(it.upkeep)} a season
              </span>
              {have ? (
                <button disabled={act.busy} className={sbtn()} onClick={() => act.run("sellItem", it.id)}>
                  {it.price ? "Sell" : "Stop"}
                </button>
              ) : (
                <button disabled={act.busy || locked} className={sbtn("bg-race hover:bg-red-500")} onClick={() => act.run("buyItem", it.id)}>
                  {locked ? `Fame ${it.needs}` : it.price ? "Buy" : "Hire"}
                </button>
              )}
            </div>
          </Card2>
        );
      })}
    </div>
  );
}

// ───────── Social ─────────
function Social({ c, L, handle, name }: { c: CareerState; L: LifeState; handle: string; name: string }) {
  return (
    <div>
      <div className="flex items-center gap-4 border-b border-ink-800 px-5 py-5">
        <Avatar name={name} color="#9d174d" />
        <div className="flex-1">
          <div className="text-lg font-bold text-white">@{handle}</div>
          <div className="text-sm text-slate-400">{name}</div>
        </div>
        <div className="text-right">
          <div className="font-display text-3xl font-black text-white">{compact(followers(c.fame))}</div>
          <div className="text-sm text-slate-400">followers</div>
        </div>
      </div>
      <div className="divide-y divide-ink-800">
        {L.feed.map((p, i) => (
          <div key={i} className="px-5 py-4">
            <div className={`text-base font-bold ${p.who === `@${handle}` ? "text-pink-300" : p.who === "@paddockgossip" ? "text-amber-300" : "text-slate-300"}`}>{p.who}</div>
            <div className="mt-1 text-lg text-white">{p.text}</div>
            <div className="mt-1 text-sm text-slate-500">{compact(p.likes)} likes</div>
          </div>
        ))}
        {!L.feed.length && <div className="p-8 text-center text-lg text-slate-500">Race, and the fans will talk.</div>}
      </div>
    </div>
  );
}
