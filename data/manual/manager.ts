// Team-principal mode: the money and the rules, in one place. Figures are approximations of the real
// 2026 F1 financial and sporting rules (cost cap, prize fund by constructors' position, wind tunnel
// allocation by position). Sponsor brands are invented; swap freely.

export const FINANCE = {
  costCap: 215e6, // 2026 base cap (approximate). Excludes driver pay and the three best-paid staff.
  breachMinor: 0.05, // up to 5% over = a minor breach (fine + less wind tunnel time)
  prize: [140, 128, 118, 108, 98, 90, 82, 74, 67, 61, 56].map((m) => m * 1e6), // by constructors' position last season
  owner: [0, 30e6, 55e6, 90e6, 130e6, 170e6], // yearly owner / parent-company money by budget level 1-5
  ops: 2.9e6, // per round: freight, travel, parts, the race team (counts against the cap)
  baseStaff: 40e6, // yearly wages of the people the game doesn't model one by one (counts against the cap)
  engineFee: 17e6, // customer power units per season (counts against the cap)
  merch: 14e6, // yearly merchandise + hospitality at prestige 1.0
  ownerBailout: 0.6, // share of a negative balance the owner covers at the end of a season
};

/** Teams that build their own power unit (the rest pay a supply fee and can only work on integration). */
export const WORKS = ["mercedes", "ferrari", "red_bull", "audi", "aston_martin"];

/** Aerodynamic testing restrictions: share of the base allowance by last season's constructors' position. */
export const ATR = {
  baseHours: 400, // wind tunnel + CFD "hours" per season at 100%
  scale: [0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.15],
  breachCut: 0.1, // minor cost-cap breach: 10% less next season
};

export const SPONSOR_TIERS = {
  title: { slots: 1, base: 48e6, label: "Title partner" },
  major: { slots: 3, base: 15e6, label: "Major partner" },
  minor: { slots: 6, base: 4.2e6, label: "Official supplier" },
} as const;

/** Invented brands. `sector` is shown in the UI and keeps two rivals in one sector apart. */
export const SPONSOR_BRANDS: { name: string; sector: string }[] = [
  { name: "Halcyon Energy", sector: "Energy" },
  { name: "Northvale Bank", sector: "Banking" },
  { name: "Vantor Mobile", sector: "Telecoms" },
  { name: "Quillstone Software", sector: "Software" },
  { name: "Ardent Watches", sector: "Watches" },
  { name: "Brightwell Insurance", sector: "Insurance" },
  { name: "Solvar Cloud", sector: "Cloud" },
  { name: "Kestrel Airways", sector: "Airline" },
  { name: "Marlow & Finch", sector: "Fashion" },
  { name: "Tidewater Lubricants", sector: "Lubricants" },
  { name: "Pelion Crypto Exchange", sector: "Crypto" },
  { name: "Orrin Beverages", sector: "Drinks" },
  { name: "Cobalt Logistics", sector: "Logistics" },
  { name: "Elmstead Tyres Retail", sector: "Retail" },
  { name: "Novaline Chips", sector: "Semiconductors" },
  { name: "Grayhaven Consulting", sector: "Consulting" },
  { name: "Lumen Optics", sector: "Eyewear" },
  { name: "Saffron Hotels", sector: "Hospitality" },
  { name: "Redcliff Motors Finance", sector: "Finance" },
  { name: "Atlas Freight", sector: "Logistics" },
  { name: "Wren Headphones", sector: "Electronics" },
  { name: "Juniper Health", sector: "Health" },
  { name: "Copperline Cables", sector: "Industrial" },
  { name: "Hollis Gaming", sector: "Gaming" },
  { name: "Silverbirch Whisky", sector: "Spirits" },
  { name: "Polaris Payments", sector: "Payments" },
  { name: "Vireo Sportswear", sector: "Sportswear" },
  { name: "Castell Paints", sector: "Industrial" },
  { name: "Zephyrine AI Labs", sector: "AI" },
  { name: "Oakridge Energy Drinks", sector: "Drinks" },
];

export const FACILITIES = {
  tunnel: { label: "Wind tunnel", cost: [0, 0, 18e6, 30e6, 46e6, 66e6], rounds: [0, 0, 8, 10, 12, 14] },
  cfd: { label: "CFD cluster", cost: [0, 0, 10e6, 17e6, 26e6, 38e6], rounds: [0, 0, 5, 6, 8, 10] },
  sim: { label: "Driver simulator", cost: [0, 0, 8e6, 14e6, 22e6, 32e6], rounds: [0, 0, 5, 6, 8, 10] },
  factory: { label: "Factory and machining", cost: [0, 0, 14e6, 24e6, 36e6, 52e6], rounds: [0, 0, 6, 8, 10, 12] },
} as const;

export const STAFF_ROLES = {
  td: { label: "Technical director", pay: [1.5e6, 9e6] },
  aero: { label: "Head of aerodynamics", pay: [0.8e6, 5e6] },
  design: { label: "Chief designer", pay: [0.7e6, 4.5e6] },
  engineer: { label: "Head of race engineering", pay: [0.5e6, 3e6] },
  strategy: { label: "Head of strategy", pay: [0.4e6, 2.5e6] },
  pit: { label: "Pit crew chief", pay: [0.3e6, 1.8e6] },
} as const;
