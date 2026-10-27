type LabelEntry = { id: string; name: string | null; detail: string | null };

/**
 * Maps IDs to display labels. A chart groups series by label, so labels shared
 * by several IDs get their detail appended to keep the bars apart. A `Map`, as
 * IDs are caller-controlled and may be `__proto__` or `constructor`.
 */
export function toLabelMap(
  entries: readonly LabelEntry[],
): ReadonlyMap<string, string> {
  const baseLabels = entries.map((entry) => ({
    entry,
    label: entry.name || entry.detail || entry.id,
  }));
  const counts = new Map<string, number>();
  for (const { label } of baseLabels) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return new Map(
    baseLabels.map(({ entry, label }) => {
      const isDuplicate = (counts.get(label) ?? 0) > 1;
      const suffix =
        entry.detail && entry.detail !== label ? entry.detail : entry.id;
      return [entry.id, isDuplicate ? `${label} (${suffix})` : label];
    }),
  );
}
