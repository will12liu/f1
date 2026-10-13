export const money = (n: number, digits = 1) => {
  const abs = Math.abs(n);
  const s = abs >= 1e6 ? `$${(abs / 1e6).toFixed(digits)}M` : abs >= 1e3 ? `$${Math.round(abs / 1e3)}K` : `$${abs}`;
  return n < 0 ? `-${s}` : s;
};

/** 83.456 -> "1:23.456" */
export function lapTime(s: number): string {
  if (!isFinite(s)) return "-";
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(3).padStart(6, "0")}`;
}

/** Race time: "1:32:04.512" */
export function raceTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s - h * 3600 - m * 60;
  return `${h}:${String(m).padStart(2, "0")}:${rest.toFixed(3).padStart(6, "0")}`;
}

export const gap = (s: number) => `+${s.toFixed(3)}`;

export const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export function ovrClass(v: number): string {
  if (v >= 90) return "bg-amber-400/20 text-amber-300 ring-amber-400/40";
  if (v >= 85) return "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30";
  if (v >= 79) return "bg-sky-500/15 text-sky-300 ring-sky-400/30";
  if (v >= 72) return "bg-slate-500/15 text-slate-300 ring-slate-400/20";
  return "bg-rose-500/10 text-rose-300 ring-rose-400/20";
}

export function barColor(v: number): string {
  if (v >= 88) return "bg-emerald-400";
  if (v >= 78) return "bg-sky-400";
  if (v >= 65) return "bg-slate-400";
  return "bg-rose-400";
}

export const FLAGS: Record<string, string> = {
  Dutch: "🇳🇱", British: "🇬🇧", Australian: "🇦🇺", Monegasque: "🇲🇨", Italian: "🇮🇹", Spanish: "🇪🇸", Thai: "🇹🇭", French: "🇫🇷",
  "New Zealander": "🇳🇿", Argentine: "🇦🇷", German: "🇩🇪", Brazilian: "🇧🇷", Canadian: "🇨🇦", Mexican: "🇲🇽", Finnish: "🇫🇮",
  Japanese: "🇯🇵", American: "🇺🇸", Chinese: "🇨🇳", Indian: "🇮🇳", Swedish: "🇸🇪", Belgian: "🇧🇪", Danish: "🇩🇰", Polish: "🇵🇱", Estonian: "🇪🇪",
  Taiwanese: "🇹🇼", "South Korean": "🇰🇷", "Hong Konger": "🇭🇰", Singaporean: "🇸🇬", Malaysian: "🇲🇾", Indonesian: "🇮🇩", Filipino: "🇵🇭", Vietnamese: "🇻🇳", Emirati: "🇦🇪", Saudi: "🇸🇦", Israeli: "🇮🇱", Turkish: "🇹🇷", Russian: "🇷🇺", Ukrainian: "🇺🇦", Czech: "🇨🇿", Austrian: "🇦🇹", Swiss: "🇨🇭", Portuguese: "🇵🇹", Irish: "🇮🇪", Norwegian: "🇳🇴", Hungarian: "🇭🇺", Romanian: "🇷🇴", Greek: "🇬🇷", Colombian: "🇨🇴", Chilean: "🇨🇱", Venezuelan: "🇻🇪", Uruguayan: "🇺🇾", Peruvian: "🇵🇪", "South African": "🇿🇦", Moroccan: "🇲🇦", Egyptian: "🇪🇬", Nigerian: "🇳🇬",
};
export const COUNTRY_FLAGS: Record<string, string> = {
  Australia: "🇦🇺", China: "🇨🇳", Japan: "🇯🇵", Bahrain: "🇧🇭", "Saudi Arabia": "🇸🇦", USA: "🇺🇸", Italy: "🇮🇹", Canada: "🇨🇦", Monaco: "🇲🇨",
  Spain: "🇪🇸", Austria: "🇦🇹", UK: "🇬🇧", Belgium: "🇧🇪", Hungary: "🇭🇺", Netherlands: "🇳🇱", Azerbaijan: "🇦🇿", Malaysia: "🇲🇾",
  Singapore: "🇸🇬", Mexico: "🇲🇽", Brazil: "🇧🇷", Qatar: "🇶🇦", UAE: "🇦🇪",
};
