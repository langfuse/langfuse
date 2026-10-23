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

export type TopicTone = "good" | "mixed" | "bad" | "failed" | "neutral";

/** Built-in facets answer with a fixed label before the colon. */
const LABEL_TONES: Record<string, TopicTone> = {
  Positive: "good",
  Neutral: "neutral",
  Mixed: "mixed",
  Negative: "bad",
  Completed: "good",
  Partial: "mixed",
  Unconfirmed: "mixed",
  "Needs input": "neutral",
  "Not completed": "failed",
};

export const summaryTone = (summary: string): TopicTone | null =>
  LABEL_TONES[summary.split(":", 1)[0].trim()] ?? null;

const TONE_TOKENS: Record<TopicTone, string> = {
  good: "--category-emerald-highlight",
  mixed: "--category-amber-highlight",
  bad: "--category-pink-highlight",
  failed: "--category-orange-highlight",
  neutral: "--category-neutral-highlight",
};

const TONE_HEX: Record<TopicTone, string> = {
  good: "#059669",
  mixed: "#d97706",
  bad: "#db2777",
  failed: "#c2410c",
  neutral: "#71717a",
};

/** Topics sharing a tone step away from the base: positive mixes toward the text color, negative toward the page. */
const SHADE_STEPS = [0, 24, -24, 44, -40];

const shadeStep = (shade: number) => SHADE_STEPS[shade % SHADE_STEPS.length];

export function toneCssColor(tone: TopicTone, shade: number) {
  const base = `var(${TONE_TOKENS[tone]})`;
  const step = shadeStep(shade);
  if (step === 0) return base;
  const target = step > 0 ? "hsl(var(--foreground))" : "hsl(var(--background))";
  return `color-mix(in oklch, ${base}, ${target} ${Math.abs(step)}%)`;
}

function mixHex(from: string, to: string, amount: number) {
  const channel = (hex: string, offset: number) =>
    parseInt(hex.slice(offset, offset + 2), 16);
  return `#${[1, 3, 5]
    .map((offset) =>
      Math.round(
        channel(from, offset) +
          (channel(to, offset) - channel(from, offset)) * amount,
      )
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export function toneHexColor(tone: TopicTone, shade: number) {
  const step = shadeStep(shade);
  return mixHex(
    TONE_HEX[tone],
    step > 0 ? "#000000" : "#ffffff",
    Math.abs(step) / 100,
  );
}

/** Tile classes read the topic color from the `--tile-color` variable set on the tile. */
export const toneTileClasses = {
  big: "bg-(--tile-color)/35",
  small: "bg-(--tile-color)/20",
  active: "bg-(--tile-color)",
  hover: "hover:bg-(--tile-color)",
};
