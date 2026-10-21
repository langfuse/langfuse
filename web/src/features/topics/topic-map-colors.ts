/** Canvas colors match the category tokens in styles/globals.css. */
const COLORS = [
  "#7c3aed",
  "#0284c7",
  "#059669",
  "#d97706",
  "#db2777",
  "#4f46e5",
  "#0d9488",
  "#c2410c",
  "#65a30d",
  "#a21caf",
] as const;

export const topicColor = (index: number) =>
  index < 0 ? "#94a3b8" : COLORS[index % COLORS.length];

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

/** Grey tile for traces without a topic. */
export const unassignedTileClasses = {
  tile: "bg-category-neutral-tint",
  active: "bg-category-neutral-highlight",
  hover: "hover:bg-category-neutral-highlight",
};

export const UNASSIGNED_SWATCH_COLOR = "var(--category-neutral-highlight)";
