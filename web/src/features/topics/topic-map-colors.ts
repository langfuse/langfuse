/** Canvas colors: the six category hues of styles/globals.css at oklch(0.58 0.13 h). */
const COLORS = [
  { color: "#7e69c0" },
  { color: "#397dc4" },
  { color: "#00918b" },
  { color: "#578b35" },
  { color: "#aa6a00" },
  { color: "#b25785" },
] as const;

export const topicColor = (index: number) =>
  index < 0 ? "#94a3b8" : COLORS[index % COLORS.length].color;

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

/** The scatter extends the treemap's three hues to eight category hues. */
const SCATTER_HUES = [
  "violet",
  "blue",
  "amber",
  "pink",
  "green",
  "teal",
  "peach",
  "olive",
];

export const scatterSwatchColor = (rank: number) =>
  `var(--category-${SCATTER_HUES[Math.max(0, rank) % SCATTER_HUES.length]}-highlight)`;

/** Topic chip color for a treemap rank; grey when the topic is not in the current results. */
export const treemapBadgeColor = (rank: number) =>
  rank < 0
    ? ("filled" as const)
    : (["violet", "blue", "amber"] as const)[rank % 3];

/** Grey tile for traces without a topic. */
export const unassignedTileClasses = {
  tile: "bg-category-neutral-tint",
  active: "bg-category-neutral-highlight",
  hover: "hover:bg-category-neutral-highlight",
};

export const UNASSIGNED_SWATCH_COLOR = "var(--category-neutral-highlight)";
