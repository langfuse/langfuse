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

const TREEMAP_HUES = [
  {
    big: "bg-category-violet-highlight/35",
    small: "bg-category-violet-highlight/20",
    active: "bg-category-violet-highlight",
    hover: "hover:bg-category-violet-highlight",
  },
  {
    big: "bg-category-blue-highlight/35",
    small: "bg-category-blue-highlight/20",
    active: "bg-category-blue-highlight",
    hover: "hover:bg-category-blue-highlight",
  },
  {
    big: "bg-category-amber-highlight/35",
    small: "bg-category-amber-highlight/20",
    active: "bg-category-amber-highlight",
    hover: "hover:bg-category-amber-highlight",
  },
] as const;

export const treemapTileClasses = (rank: number, big: boolean) => {
  const hue = TREEMAP_HUES[Math.max(0, rank) % TREEMAP_HUES.length];
  return {
    tile: big ? hue.big : hue.small,
    active: hue.active,
    hover: hue.hover,
  };
};

export const treemapSwatchColor = (rank: number) =>
  `var(--category-${["violet", "blue", "amber"][Math.max(0, rank) % 3]}-highlight)`;

/** Topic chip color for a treemap rank; grey when the topic is not in the current results. */
export const treemapBadgeColor = (rank: number) =>
  rank < 0
    ? ("filled" as const)
    : (["violetHighlight", "blueHighlight", "amberHighlight"] as const)[
        rank % 3
      ];

/** Grey tile for traces without a topic. */
export const unassignedTileClasses = {
  tile: "bg-category-neutral-tint",
  active: "bg-category-neutral-highlight",
  hover: "hover:bg-category-neutral-highlight",
};

export const UNASSIGNED_SWATCH_COLOR = "var(--category-neutral-highlight)";
