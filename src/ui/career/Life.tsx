// Life off the track: the phone fills the screen, with your life at a glance on either side (wide screens).
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { careerOf, meOf } from "../../engine/career/career";
import { followers, HOMES, money, netWorth } from "../../engine/career/life";
import { useGame } from "../../state/game";
import { Icon, Phone, type AppId } from "./Phone";

export function Life() {
  const world = useGame((s) => s.world);
  const act = useGame((s) => s.act);
  const [sp, setSp] = useSearchParams();
  const app = (sp.get("app") as AppId) || "home";
  const setApp = (a: AppId) => setSp(a === "home" ? {} : { app: a }, { replace: true });
  const c = world ? careerOf(world) : null;
  useEffect(() => {
    if (c && !c.life) void act("lifeInit");
  }, [c, act]);
  if (!world || !c) return null;
  const d = meOf(world)!;
  const L = c.life;
  const nw = netWorth(c);
  const partner = L?.people.find((p) => p.role === "partner");
  const home = L?.homes.find((h) => !h.rented);
  const big = (k: string, v: string | number, sub?: string) => (
    <div className="border-t border-ink-800 py-4">
      <div className="kicker">{k}</div>
      <div className="mt-1 font-display text-5xl font-black leading-none text-white">{v}</div>
      {sub && <div className="mt-1 text-base text-slate-400">{sub}</div>}
    </div>
  );
  const shortcut: Exclude<AppId, "home">[] = ["messages", "contacts", "bank", "stocks", "crypto", "homes", "garage", "business", "team", "social"];
  return (
    <div className="grid items-start gap-8 xl:grid-cols-[1fr_auto_1fr]">
      <aside className="hidden xl:block">
        <div className="kicker">Off the track</div>
        <h1 className="headline mt-2 text-7xl">Life</h1>
        <p className="mt-3 max-w-sm text-lg text-slate-400">
          Your phone. People text you between races, and your money, homes and cars live here. It all moves once a race weekend.
        </p>
        <div className="mt-6 max-w-sm">
          {big("Net worth", money(nw.total), `${money(nw.cash)} in the bank`)}
          {big("Morale", Math.round(c.morale ?? 60), "A happy driver is a little quicker")}
          {big("Followers", followers(c.fame).toLocaleString(), `Fame ${Math.round(c.fame)}`)}
          {big("At home", partner ? partner.name.split(" ")[0] : "Single", partner ? `${partner.status ?? ""}`.replace("together", "living together") : home ? HOMES.find((h) => h.key === home.key)?.name : "Renting a room")}
        </div>
      </aside>
      <Phone world={world} app={app} setApp={setApp} />
      <aside className="hidden xl:block">
        <div className="kicker">Apps</div>
        <div className="mt-4 grid max-w-sm grid-cols-2 gap-2">
          {shortcut.map((a) => (
            <button key={a} onClick={() => setApp(a)} className={`flex items-center gap-3 rounded-lg p-2 text-left ${app === a ? "bg-ink-800" : "hover:bg-ink-900"}`}>
              <Icon id={a} size={44} />
              <span className="font-display text-xl font-bold uppercase text-white">{a}</span>
              {a === "messages" && c.event && <span className="ml-auto h-3 w-3 rounded-full bg-race" />}
            </button>
          ))}
        </div>
        {L && (
          <div className="mt-8 max-w-sm">
            <div className="kicker">Recent</div>
            <div className="mt-3 grid gap-3">
              {L.msgs
                .slice(-5)
                .reverse()
                .map((m, i) => (
                  <div key={i} className="border-l-2 border-ink-700 pl-3">
                    <div className="text-sm font-bold uppercase text-slate-500">{m.me ? `You to ${m.from}` : m.from}</div>
                    <div className="text-base text-slate-300">{m.text}</div>
                  </div>
                ))}
            </div>
          </div>
        )}
        <div className="mt-6 max-w-sm text-sm text-slate-500">{d.first}, the racing comes first: perks here are small.</div>
      </aside>
    </div>
  );
}
