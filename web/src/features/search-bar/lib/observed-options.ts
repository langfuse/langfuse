// Bridge from the events filterOptions payload (useEventsFilterOptions) to
// the flat per-column observed-value map the completion planner consumes.
//
// Keys:
//   <columnId>                      → observed values (with counts when known)
//   scores_avg / trace_scores_avg   → numeric score NAMES
//   score_categories[.<name>]       → categorical score names / their values
//   (metadata keys are not enumerated by the API today — metadata key paths
//   complete from free typing only)

import type { ScoreTypeContext } from "./adapter";
import { SCORE_COLUMNS } from "./fields";

export type ObservedValue = { value: string; count?: number };
export type ObservedOptions = Record<string, ObservedValue[]>;

type RawOption = string | { value: string; count?: number };

type RawFilterOptions = Record<
  string,
  RawOption[] | Record<string, string[]> | undefined
>;

function toObservedValues(options: RawOption[]): ObservedValue[] {
  const out: ObservedValue[] = [];
  for (const o of options) {
    if (typeof o === "string") {
      if (o.length > 0) out.push({ value: o });
    } else if (o && typeof o.value === "string" && o.value.length > 0) {
      out.push(
        o.count !== undefined
          ? { value: o.value, count: o.count }
          : { value: o.value },
      );
    }
  }
  return out;
}

function removeObservedValues(
  options: ObservedValue[] | undefined,
  excluded: ReadonlySet<string>,
): ObservedValue[] | undefined {
  if (!options || excluded.size === 0) return options;
  return options.filter((option) => !excluded.has(option.value));
}

function normalizeScoreColumns(
  out: ObservedOptions,
  columns: (typeof SCORE_COLUMNS)["observation" | "trace"],
): void {
  const booleanNames = new Set(
    (out[columns.boolean] ?? []).map((option) => option.value),
  );

  // Backend score option discovery keeps BOOLEAN names in numeric options for
  // legacy consumers. Keep backend compatibility but make the search bar treat
  // those names as boolean-only.
  out[columns.numeric] =
    removeObservedValues(out[columns.numeric], booleanNames) ?? [];
}

function normalizeScoreTypes(out: ObservedOptions): void {
  normalizeScoreColumns(out, SCORE_COLUMNS.observation);
  normalizeScoreColumns(out, SCORE_COLUMNS.trace);
}

/**
 * Flatten the sidebar filter-options shape into observed-value lists keyed
 * the way the completion planner looks them up. Returns undefined while the
 * source is still loading so value stages can show a loading row.
 */
export function toObservedOptions(
  raw: RawFilterOptions | undefined,
  loading: boolean,
): ObservedOptions | undefined {
  if (loading || raw === undefined) return undefined;

  const out: ObservedOptions = {};
  for (const [column, options] of Object.entries(raw)) {
    if (options === undefined) continue;
    if (Array.isArray(options)) {
      out[column] = toObservedValues(options);
      continue;
    }
    // Keyed columns (score_categories & friends): Record<name, values[]>.
    out[column] = Object.keys(options).map((name) => ({ value: name }));
    for (const [name, values] of Object.entries(options)) {
      out[`${column}.${name}`] = values
        .filter((v) => v.length > 0)
        .map((v) => ({ value: v }));
    }
  }
  normalizeScoreTypes(out);
  return out;
}

/**
 * Derive the score-name→type sets the adapter needs to route
 * `scores.<name>:<value>` to the numeric (`scores_avg`) vs categorical
 * (`score_categories`) column. Built from the same observed map the completion
 * planner reads, so the bar's suggestions and its commit agree on score types.
 */
export function scoreTypeContextFromObserved(
  observed: ObservedOptions | undefined,
): ScoreTypeContext {
  const names = (column: string): Set<string> =>
    new Set((observed?.[column] ?? []).map((o) => o.value));
  return {
    numericScoreNames: names("scores_avg"),
    categoricalScoreNames: names("score_categories"),
    booleanScoreNames: names("score_booleans"),
    traceNumericScoreNames: names("trace_scores_avg"),
    traceCategoricalScoreNames: names("trace_score_categories"),
    traceBooleanScoreNames: names("trace_score_booleans"),
  };
}

function nameSetsEqual(
  a: ReadonlySet<string> | undefined,
  b: ReadonlySet<string> | undefined,
): boolean {
  if (a === b) return true;
  const sizeA = a?.size ?? 0;
  const sizeB = b?.size ?? 0;
  if (sizeA !== sizeB) return false;
  if (a) for (const v of a) if (!b?.has(v)) return false;
  return true;
}

/**
 * Set-equality of the four score-name sets. `scoreTypeContextFromObserved`
 * builds a fresh context on every `filterOptions` refetch, so under
 * auto-refresh on a relative time range the context identity rotates every tick
 * even when the underlying score types are unchanged. Callers use this to skip
 * re-validating the draft when the routing-relevant data did not actually move.
 */
export function scoreTypeContextEqual(
  a: ScoreTypeContext | undefined,
  b: ScoreTypeContext | undefined,
): boolean {
  if (a === b) return true;
  return (
    nameSetsEqual(a?.numericScoreNames, b?.numericScoreNames) &&
    nameSetsEqual(a?.categoricalScoreNames, b?.categoricalScoreNames) &&
    nameSetsEqual(a?.booleanScoreNames, b?.booleanScoreNames) &&
    nameSetsEqual(a?.traceNumericScoreNames, b?.traceNumericScoreNames) &&
    nameSetsEqual(
      a?.traceCategoricalScoreNames,
      b?.traceCategoricalScoreNames,
    ) &&
    nameSetsEqual(a?.traceBooleanScoreNames, b?.traceBooleanScoreNames)
  );
}
