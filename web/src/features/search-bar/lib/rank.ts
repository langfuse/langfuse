// Shared completion/option ranking — pure, dependency-free.
//
// Owned by the search bar (its dropdown ranking is the reference behavior);
// the filter sidebar's per-facet value search imports it so both surfaces
// rank identically (prefix matches before substring matches) instead of the
// sidebar forking its own plain-substring filter.

/** Case-insensitive match; prefix matches rank before substring matches. */
export function filterRank(label: string, query: string): number | null {
  if (query.length === 0) return 0;
  const l = label.toLowerCase();
  const q = query.toLowerCase();
  if (l.startsWith(q)) return 0;
  if (l.includes(q)) return 1;
  return null;
}

export function rankFilter<T extends { label: string }>(
  options: T[],
  query: string,
): T[] {
  return options
    .map((o) => ({ o, rank: filterRank(o.label, query) }))
    .filter((x): x is { o: T; rank: number } => x.rank !== null)
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.o);
}
