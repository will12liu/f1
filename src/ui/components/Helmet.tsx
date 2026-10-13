// A side-on race helmet in your colour, with your number. Used by the career creator and the career hub.
import { useId } from "react";
import { onColor } from "./bits";

export const HELMET_COLORS = ["#e10600", "#f97316", "#facc15", "#22c55e", "#14b8a6", "#0ea5e9", "#2563eb", "#7c3aed", "#ec4899", "#f8fafc", "#94a3b8", "#1e293b"];

export function Helmet({ color, num, className = "" }: { color: string; num?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  const ink = onColor(color);
  const shell = "M28 140 C18 78 62 30 132 28 C194 26 226 72 222 122 L222 150 C222 165 210 174 194 174 L60 174 C40 174 30 160 28 140 Z";
  return (
    <svg viewBox="0 0 250 200" className={className} aria-hidden>
      <defs>
        <clipPath id={`s${id}`}>
          <path d={shell} />
        </clipPath>
      </defs>
      <ellipse cx="125" cy="190" rx="96" ry="7" fill="#000" opacity="0.45" />
      <path d={shell} fill={color} />
      <g clipPath={`url(#s${id})`}>
        <rect x="0" y="134" width="250" height="14" fill={ink} opacity="0.9" />
        <rect x="0" y="148" width="250" height="30" fill="#000" opacity="0.28" />
        <path d="M60 28 C90 40 120 44 150 40 L150 52 C118 56 88 52 58 40 Z" fill={ink} opacity="0.35" />
      </g>
      <path d="M118 78 C160 70 206 80 220 100 L220 126 C192 118 152 116 116 120 Z" fill="#0b0d12" />
      <path d="M126 84 C160 78 196 86 210 98 L208 104 C190 94 160 88 128 92 Z" fill="#fff" opacity="0.18" />
      <path d={shell} fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="3" />
      {num !== undefined && (
        <text x="72" y="118" textAnchor="middle" fontFamily="Barlow Condensed, sans-serif" fontWeight="900" fontSize="46" fill={ink}>
          {num}
        </text>
      )}
    </svg>
  );
}
