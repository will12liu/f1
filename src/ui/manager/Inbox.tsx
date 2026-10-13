// Inbox: mail from the board, partners, the FIA, the factory and HR. Opening the page marks it read.
import { useEffect, useState } from "react";
import { useGame } from "../../state/game";
import { Section } from "../components/bits";
import type { Message } from "../../engine/manager/state";
import { useAct } from "./kit";
import { PageHead } from "../components/hub";

const KIND: Record<Message["kind"], string> = { board: "Board", sponsor: "Partners", rnd: "Factory", staff: "People", fia: "FIA", driver: "Drivers", finance: "Finance", race: "Race" };

export function Inbox() {
  const world = useGame((s) => s.world);
  const { run } = useAct();
  const [filter, setFilter] = useState<Message["kind"] | "all">("all");
  const m = world?.manager;
  const unread = m?.inbox.filter((x) => !x.read).map((x) => x.id) ?? [];
  useEffect(() => {
    if (unread.length) {
      const t = setTimeout(() => run("markRead", unread), 1500);
      return () => clearTimeout(t);
    }
  }, [unread.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!m) return null;
  const list = m.inbox.filter((x) => filter === "all" || x.kind === filter);
  const kinds = [...new Set(m.inbox.map((x) => x.kind))];

  return (
    <div className="grid gap-8">
    <PageHead title="Inbox" />
    <Section
      title="Mail"
      right={
        <div className="flex flex-wrap gap-1">
          {(["all", ...kinds] as const).map((k) => (
            <button key={k} onClick={() => setFilter(k)} className={`btn !px-3 !py-1.5 text-sm ${filter === k ? "bg-white text-black" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`}>
              {k === "all" ? "All" : KIND[k]}
            </button>
          ))}
        </div>
      }
    >
      <div className="divide-y divide-ink-800">
        {list.map((x) => (
          <article key={x.id} id={x.id} className="grid gap-1 px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-2">
              {!x.read && <span className="h-1.5 w-1.5 rounded-full bg-race" />}
              <h3 className={`text-sm ${x.read ? "text-slate-200" : "font-semibold text-white"}`}>{x.subject}</h3>
              <span className="ml-auto text-sm text-slate-500">
                {x.from} · {x.season}
                {x.round ? `, after round ${x.round}` : ", pre-season"}
              </span>
            </div>
            <p className="text-sm text-slate-400">{x.body}</p>
          </article>
        ))}
      </div>
    </Section>
    </div>
  );
}
