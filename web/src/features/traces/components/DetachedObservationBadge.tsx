/**
 * Marks the one observation that was merged into the tree from a by-id fetch
 * because it sits outside the loaded (capped) list.
 *
 * Load-bearing, not decoration. When that row's parent ALSO fell past the cap,
 * tree building cannot resolve it and the row renders at ROOT level — without a
 * marker a deeply nested observation silently reads as top-level (LFE-14993).
 * The label states the one fact that is always true; the title distinguishes the
 * two placements, since claiming "position unknown" for a row that nested
 * correctly would be its own small lie.
 */

export function DetachedObservationBadge({
  loadedObservationCount,
  parentLoaded,
}: {
  /** Cap the rest of the tree was loaded under, for the explanation. */
  loadedObservationCount?: number;
  /** False when the parent is missing too, so this row sits at root level. */
  parentLoaded: boolean;
}) {
  const scope = loadedObservationCount
    ? `the first ${loadedObservationCount.toLocaleString()} observations loaded for this trace`
    : "the observations loaded for this trace";

  return (
    <span
      className="border-border-contrast text-foreground-tertiary shrink-0 rounded-sm border border-dashed px-1 text-xs"
      title={
        parentLoaded
          ? `Loaded separately: this observation is not among ${scope}, and is shown under its parent.`
          : `Loaded separately: this observation is not among ${scope}. Its parent is not loaded either, so it is shown at the top level instead of its real position.`
      }
    >
      loaded separately
    </span>
  );
}
