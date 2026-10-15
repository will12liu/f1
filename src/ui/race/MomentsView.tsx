// How a key moment is played: the 3D cockpit, or the old move list and braking bar. The pre-race screen
// mounts this; the choice is only a preference (localStorage), so it never touches the race.
export type MomentsView = "cockpit" | "simple";

const KEY = "paddock.momentsView";

export function readMomentsView(): MomentsView {
  try {
    return localStorage.getItem(KEY) === "simple" ? "simple" : "cockpit";
  } catch {
    return "cockpit";
  }
}

const save = (v: MomentsView) => {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* private mode */
  }
};

const OPTIONS: [MomentsView, string, string][] = [
  ["cockpit", "3D cockpit", "Drive the moment yourself, from the car"],
  ["simple", "Simple", "Pick a move, then the braking bar"],
];

export function MomentsViewPicker({ value, onChange }: { value: MomentsView; onChange: (v: MomentsView) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {OPTIONS.map(([k, label, hint]) => (
        <button
          key={k}
          onClick={() => {
            save(k);
            onChange(k);
          }}
          className={`rounded-lg px-4 py-4 text-left ${value === k ? "bg-race text-white" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`}
        >
          <div className="font-display text-xl font-bold uppercase leading-tight">{label}</div>
          <div className={`mt-1 text-sm leading-snug ${value === k ? "text-white" : "text-slate-400"}`}>{hint}</div>
        </button>
      ))}
    </div>
  );
}
