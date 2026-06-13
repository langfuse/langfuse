// Bridge from the events filterOptions payload (useEventsFilterOptions) to
// the flat per-column observed-value map the completion planner consumes.
//
// Keys:
//   <columnId>                      → observed values (with counts when known)
//   scores_avg / trace_scores_avg   → numeric score NAMES
//   score_categories[.<name>]       → categorical score names / their values
//   (metadata keys are not enumerated by the API today — metadata key paths
//   complete from free typing only)

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
  return out;
}
