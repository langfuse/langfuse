import { type ComponentProps } from "react";
import {
  type ScoreConfigDomain,
  type ScoreDataTypeType,
  type ScoreSourceType,
} from "@langfuse/shared";
import { type Badge } from "@/src/components/design-system/Badge/Badge";
import { numberFormatter } from "@/src/utils/numbers";

type BadgeColor = NonNullable<ComponentProps<typeof Badge>["color"]>;

/** The slice of a score that the queue item table and summary need. */
export type QueueItemScore = {
  id: string;
  name: string;
  source: ScoreSourceType;
  configId: string | null;
  dataType: ScoreDataTypeType;
  value: number | null;
  stringValue?: string | null;
  timestamp: Date;
};

export type QueueItemScoreValue =
  | { kind: "badge"; text: string; color: BadgeColor }
  | { kind: "number"; text: string }
  | { kind: "text"; text: string };

const latestScore = (candidates: QueueItemScore[]) =>
  candidates.reduce<QueueItemScore | undefined>(
    (best, score) =>
      !best ||
      new Date(score.timestamp).getTime() > new Date(best.timestamp).getTime()
        ? score
        : best,
    undefined,
  );

/**
 * Latest score for a config: matched by config id, falling back to the config
 * name for scores written without a config id.
 */
const pickLatestScoreForConfig = (
  scores: QueueItemScore[],
  config: Pick<ScoreConfigDomain, "id" | "name">,
) =>
  latestScore(scores.filter((score) => score.configId === config.id)) ??
  latestScore(
    scores.filter(
      (score) => score.configId == null && score.name === config.name,
    ),
  );

/** Latest annotation score for a config. */
export function pickLatestAnnotationScore(
  scores: QueueItemScore[],
  config: Pick<ScoreConfigDomain, "id" | "name">,
): QueueItemScore | undefined {
  return pickLatestScoreForConfig(
    scores.filter((score) => score.source === "ANNOTATION"),
    config,
  );
}

/**
 * The value a queue item currently has for a config: the latest annotation if
 * a reviewer has set one, otherwise the latest value written by the source
 * (API or eval), flagged as `pending` because nobody has confirmed it yet.
 */
export function resolveQueueItemScore(
  scores: QueueItemScore[],
  config: Pick<ScoreConfigDomain, "id" | "name">,
): { score: QueueItemScore; pending: boolean } | undefined {
  const annotation = pickLatestAnnotationScore(scores, config);
  if (annotation) return { score: annotation, pending: false };
  const fromSource = pickLatestScoreForConfig(
    scores.filter((score) => score.source !== "ANNOTATION"),
    config,
  );
  return fromSource ? { score: fromSource, pending: true } : undefined;
}

/**
 * Categories without an override get a colour from this palette by their
 * position in the score config, so a value keeps its colour across items.
 */
const CATEGORY_PALETTE: BadgeColor[] = [
  "violetTint",
  "skyTint",
  "emeraldTint",
  "amberTint",
  "pinkTint",
  "indigoTint",
  "tealTint",
  "orangeTint",
  "limeTint",
  "fuchsiaTint",
];

/** Optional colours for well-known category labels (matched case-insensitively). */
const CATEGORY_COLOR_OVERRIDES: Record<string, BadgeColor> = {
  high: "red",
  medium: "yellow",
  low: "blue",
  pass: "green",
  fail: "red",
};

const getOverrideBadgeColor = (label: string): BadgeColor | undefined =>
  CATEGORY_COLOR_OVERRIDES[label.trim().toLowerCase()];

/**
 * Colour for a free-form value without a category list: the override if one
 * matches, otherwise a palette colour picked by a hash of the value, so the
 * same value always gets the same colour.
 */
export function getValueBadgeColor(label: string): BadgeColor {
  const override = getOverrideBadgeColor(label);
  if (override) return override;
  let hash = 0;
  for (const char of label) {
    hash = (hash * 31 + char.charCodeAt(0)) % 2_147_483_647;
  }
  return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length];
}

export function getCategoryBadgeColor(
  label: string,
  config: Pick<ScoreConfigDomain, "categories">,
): BadgeColor {
  const override = getOverrideBadgeColor(label);
  if (override) return override;

  const index =
    config.categories?.findIndex((category) => category.label === label) ?? -1;
  if (index < 0) return "primary";
  return CATEGORY_PALETTE[index % CATEGORY_PALETTE.length];
}

export function formatQueueItemScore(
  score: QueueItemScore,
  config: Pick<ScoreConfigDomain, "categories">,
): QueueItemScoreValue | undefined {
  switch (score.dataType) {
    case "CATEGORICAL":
    case "BOOLEAN": {
      const text = score.stringValue ?? "";
      if (!text) return undefined;
      return {
        kind: "badge",
        text,
        color: getCategoryBadgeColor(text, config),
      };
    }
    case "NUMERIC":
      if (score.value === null || score.value === undefined) return undefined;
      return { kind: "number", text: numberFormatter(score.value, 0, 4) };
    case "TEXT":
      return score.stringValue
        ? { kind: "text", text: score.stringValue }
        : undefined;
    default:
      return undefined;
  }
}
