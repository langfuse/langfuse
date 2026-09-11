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
export function splitEvaluatorPrefix(
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
