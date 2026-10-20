/** Canvas colors match the category tokens in styles/globals.css. */
const COLORS = [
  { color: "#7c3aed", badgeColor: "violetTint" },
  { color: "#0284c7", badgeColor: "skyTint" },
  { color: "#059669", badgeColor: "emeraldTint" },
  { color: "#d97706", badgeColor: "amberTint" },
  { color: "#db2777", badgeColor: "pinkTint" },
  { color: "#4f46e5", badgeColor: "indigoTint" },
  { color: "#0d9488", badgeColor: "tealTint" },
  { color: "#c2410c", badgeColor: "orangeTint" },
  { color: "#65a30d", badgeColor: "limeTint" },
  { color: "#a21caf", badgeColor: "fuchsiaTint" },
] as const;

export const topicColor = (index: number) =>
  index < 0 ? "#94a3b8" : COLORS[index % COLORS.length].color;

export const topicBadgeColor = (
  index: number,
): (typeof COLORS)[number]["badgeColor"] | "primary" =>
  index < 0 ? "primary" : COLORS[index % COLORS.length].badgeColor;
