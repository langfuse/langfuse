/**
 * How the score chips bucket a node's scores.
 *
 * Default: one chip per score NAME (two annotators scoring "helpfulness" are
 * one chip with two values). On top of that, an EVALUATOR group: scores whose
 * names share the text before the first `.`, `:` or `/` collapse into one chip
 * labelled with that prefix, once at least two distinct metric names share
 * it. One evaluator emitting `OutputModerationPrecision.toxicity`,
 * `OutputModerationPrecision.pii`, ... twenty times over is then one chip,
 * not twenty; the hover card lists the metrics.
 *
 * Assumption: the evaluator is encoded in the name by convention. Score
 * metadata is not consulted, so a project that keeps the evaluator in
 * metadata (or uses another separator) sees per-name chips as before. A
 * single prefixed name never groups: `gpt-4.1` or `v1.2` alone is a name,
 * not an evaluator.
 */

const EVALUATOR_SEPARATOR = /[.:/]/;

export type ScoreChipGroup<T> = {
  /** Chip text: the score name, or the evaluator prefix the names share. */
  label: string;
  kind: "name" | "evaluator";
  scores: T[];
};

/** `Evaluator.metric` -> { evaluator, metric }; null when the name has no
    prefix (no separator, or a separator at either end). */
function splitEvaluatorPrefix(
  name: string,
): { evaluator: string; metric: string } | null {
  const index = name.search(EVALUATOR_SEPARATOR);
  if (index <= 0 || index === name.length - 1) return null;
  return { evaluator: name.slice(0, index), metric: name.slice(index + 1) };
}

/** The part of the name a group chip's hover lists: the metric behind the
    prefix, or the whole name when there is none. */
export const metricLabel = (name: string): string =>
  splitEvaluatorPrefix(name)?.metric ?? name;

export function groupScoresForChips<T extends { name: string }>(
  scores: ReadonlyArray<T>,
): ScoreChipGroup<T>[] {
  const byName = new Map<string, T[]>();
  for (const score of scores) {
    const bucket = byName.get(score.name);
    if (bucket) bucket.push(score);
    else byName.set(score.name, [score]);
  }

  const namesByEvaluator = new Map<string, string[]>();
  for (const name of byName.keys()) {
    const split = splitEvaluatorPrefix(name);
    if (!split) continue;
    const names = namesByEvaluator.get(split.evaluator);
    if (names) names.push(name);
    else namesByEvaluator.set(split.evaluator, [name]);
  }

  const groups: ScoreChipGroup<T>[] = [];
  const grouped = new Set<string>();
  for (const [evaluator, names] of namesByEvaluator) {
    if (names.length < 2) continue;
    groups.push({
      kind: "evaluator",
      label: evaluator,
      scores: names.flatMap((name) => byName.get(name) ?? []),
    });
    for (const name of names) grouped.add(name);
  }
  for (const [name, list] of byName) {
    if (grouped.has(name)) continue;
    groups.push({ kind: "name", label: name, scores: list });
  }

  // Alphabetical by chip text, the order the chips always had.
  return groups.sort((a, b) =>
    a.label < b.label ? -1 : a.label > b.label ? 1 : 0,
  );
}

/** The fields a group summary reads; `ScoreDomain`, `LastUserScore` and the
    Scores table's rows all provide them. */
export type SummarizableScore = {
  name: string;
  dataType: string;
  value?: number | null;
  stringValue?: string | null;
};

/** How many distinct metric names a group holds: the count the chip shows. */
export const groupMetricCount = <T extends { name: string }>(
  group: ScoreChipGroup<T>,
): number => new Set(group.scores.map((score) => score.name)).size;

/** Categorical values that mean "not scored". Such a metric counts toward
    the group size but not toward its data type or its summary. */
export const UNSCORED_PLACEHOLDERS: ReadonlySet<string> = new Set([
  "n/a",
  "na",
  "none",
  "null",
  "unknown",
  "not applicable",
  "",
]);

const isUnscoredPlaceholder = (score: SummarizableScore): boolean =>
  score.dataType === "CATEGORICAL" &&
  UNSCORED_PLACEHOLDERS.has((score.stringValue ?? "").trim().toLowerCase());

/**
 * One number for a group and the count it stands for. Only a group of ONE
 * data type is summarised: all numeric -> `Avg X.XX`; all boolean ->
 * `k/total true` (stored 1 = true); all categorical -> the majority value
 * and its share. A group mixing data types gets no text: the chip reads
 * `Prefix(N)` and the table header shows only the count. Categorical
 * placeholders for "not scored" (UNSCORED_PLACEHOLDERS) are left out of the
 * type check and the tallies, so a numeric evaluator that emits "n/a" for
 * two metrics still averages the rest. `count` is always the number of
 * metrics.
 */
export function groupSummary<T extends SummarizableScore>(
  group: ScoreChipGroup<T>,
): { count: number; text: string | null } {
  const total = groupMetricCount(group);
  const scored = group.scores.filter((score) => !isUnscoredPlaceholder(score));
  const dataTypes = new Set(scored.map((score) => score.dataType));
  if (dataTypes.size !== 1) return { count: total, text: null };
  const [dataType] = dataTypes;

  if (dataType === "NUMERIC" || dataType === "BOOLEAN") {
    const values = scored.flatMap((score) =>
      typeof score.value === "number" ? [score.value] : [],
    );
    if (values.length === 0) return { count: total, text: null };
    if (dataType === "BOOLEAN") {
      const trueCount = values.filter((value) => value === 1).length;
      return { count: total, text: `${trueCount}/${total} true` };
    }
    const average =
      values.reduce((sum, value) => sum + value, 0) / values.length;
    return { count: total, text: `Avg ${average.toFixed(2)}` };
  }

  const tally = new Map<string, number>();
  for (const score of scored) {
    if (score.stringValue) {
      tally.set(score.stringValue, (tally.get(score.stringValue) ?? 0) + 1);
    }
  }
  const [top] = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  return {
    count: total,
    text: top ? `Mostly ${top[0]} (${top[1]}/${total})` : null,
  };
}
