// The wheel in front of the driver: a round rim, the button colours from an onboard, gloves on the grips.
// Speed sits in the middle. `steer` is -1..1 (left positive), same sign as the car.

const DOTS = ["#ef4444", "#facc15", "#22c55e", "#3b82f6", "#f8fafc", "#a855f7", "#f97316", "#94a3b8"];

export function WheelHud({ kmh, gear, note, steer = 0 }: { kmh: number; gear: number; note?: string; steer?: number }) {
  return (
    <div className="pointer-events-none absolute bottom-[-6%] left-1/2 w-[min(44vw,500px)]" style={{ transform: `translateX(-50%) rotate(${-steer * 70}deg)` }}>
      <svg viewBox="0 0 200 200" className="w-full">
        <circle cx="100" cy="100" r="78" fill="none" stroke="#14161a" strokeWidth="18" />
        <circle cx="100" cy="100" r="62" fill="none" stroke="#2a2e33" strokeWidth="3" />
        {DOTS.map((fill, i) => {
          const a = -Math.PI / 2 + (i / DOTS.length) * Math.PI * 2;
          return <circle key={fill} cx={100 + Math.cos(a) * 70} cy={100 + Math.sin(a) * 70} r="7" fill={fill} />;
        })}
        <circle cx="100" cy="100" r="40" fill="#0b0d10" />
        <text x="100" y="96" textAnchor="middle" fill="#f8fafc" fontSize="28" fontWeight="700" fontFamily="sans-serif">
          {Math.round(kmh)}
        </text>
        <text x="100" y="118" textAnchor="middle" fill="#94a3b8" fontSize="11" fontWeight="700" fontFamily="sans-serif">
          {note ?? `GEAR ${gear}`}
        </text>
        <ellipse cx="38" cy="112" rx="20" ry="14" fill="#f4f4f5" />
        <ellipse cx="162" cy="112" rx="20" ry="14" fill="#f4f4f5" />
        <rect x="18" y="104" width="14" height="16" rx="3" fill="#b91c1c" />
        <rect x="168" y="104" width="14" height="16" rx="3" fill="#b91c1c" />
      </svg>
    </div>
  );
}

/** The top of the helmet, sitting at the bottom of an onboard. */
export function Helmet() {
  return <div className="pointer-events-none absolute bottom-0 left-1/2 h-14 w-56 -translate-x-1/2 rounded-t-full bg-[#6d28d9]" />;
}
