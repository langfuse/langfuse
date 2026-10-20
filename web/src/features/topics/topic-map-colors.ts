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
    big: "bg-topic-violet-big/60",
    small: "bg-topic-violet-small/60",
    active: "bg-topic-violet",
    hover: "hover:bg-topic-violet",
  },
  {
    big: "bg-topic-blue-big/60",
    small: "bg-topic-blue-small/60",
    active: "bg-topic-blue",
    hover: "hover:bg-topic-blue",
  },
  {
    big: "bg-topic-orange-big/60",
    small: "bg-topic-orange-small/60",
    active: "bg-topic-orange",
    hover: "hover:bg-topic-orange",
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
  `var(--topic-${["violet", "blue", "orange"][Math.max(0, rank) % 3]})`;

const TONE_TILES = {
  good: {
    tile: "bg-category-emerald-tint",
    active: "bg-category-emerald-highlight",
    hover: "hover:bg-category-emerald-highlight",
  },
  mixed: {
    tile: "bg-category-amber-tint",
    active: "bg-category-amber-highlight",
    hover: "hover:bg-category-amber-highlight",
  },
  bad: {
    tile: "bg-category-pink-tint",
    active: "bg-category-pink-highlight",
    hover: "hover:bg-category-pink-highlight",
  },
  failed: {
    tile: "bg-category-orange-tint",
    active: "bg-category-orange-highlight",
    hover: "hover:bg-category-orange-highlight",
  },
  neutral: {
    tile: "bg-category-neutral-tint",
    active: "bg-category-neutral-highlight",
    hover: "hover:bg-category-neutral-highlight",
  },
} as const;

export type TopicTone = keyof typeof TONE_TILES;

/** Built-in facets answer with a fixed label before the colon; each label maps to a tone. */
const FACET_LABEL_TONES: Record<string, Record<string, TopicTone>> = {
  Sentiment: {
    Positive: "good",
    Neutral: "neutral",
    Mixed: "mixed",
    Negative: "bad",
  },
  Outcome: {
    Completed: "good",
    Partial: "mixed",
    Unconfirmed: "mixed",
    "Needs input": "neutral",
    "Not completed": "failed",
  },
};

export function topicTone(
  facetName: string,
  summaries: string[],
): TopicTone | null {
  const tones = FACET_LABEL_TONES[facetName];
  if (!tones) return null;
  const counts = new Map<TopicTone, number>();
  for (const summary of summaries) {
    const tone = tones[summary.split(":", 1)[0].trim()];
    if (tone) counts.set(tone, (counts.get(tone) ?? 0) + 1);
  }
  let best: TopicTone | null = null;
  for (const [tone, count] of counts) {
    if (best === null || count > (counts.get(best) ?? 0)) best = tone;
  }
  return best;
}

export const topicToneTileClasses = (tone: TopicTone) => TONE_TILES[tone];

const TONE_SWATCHES: Record<TopicTone, string> = {
  good: "var(--category-emerald-highlight)",
  mixed: "var(--category-amber-highlight)",
  bad: "var(--category-pink-highlight)",
  failed: "var(--category-orange-highlight)",
  neutral: "var(--category-neutral-highlight)",
};

export const topicToneSwatchColor = (tone: TopicTone) => TONE_SWATCHES[tone];

const TONE_COLORS: Record<TopicTone, string> = {
  good: "#059669",
  mixed: "#d97706",
  bad: "#db2777",
  failed: "#c2410c",
  neutral: "#71717a",
};

export const topicToneColor = (tone: TopicTone) => TONE_COLORS[tone];
