type LabelEntry = { id: string; name: string | null; detail: string | null };

/**
 * Maps IDs to display labels. A chart groups series by label, so labels shared
 * by several IDs get their detail appended to keep the bars apart.
 */
export function toLabelMap(entries: readonly LabelEntry[]) {
  const baseLabels = entries.map((entry) => ({
    entry,
    label: entry.name || entry.detail || entry.id,
  }));
  const counts = new Map<string, number>();
  for (const { label } of baseLabels) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return Object.fromEntries(
    baseLabels.map(({ entry, label }) => {
      const isDuplicate = (counts.get(label) ?? 0) > 1;
      const suffix =
        entry.detail && entry.detail !== label ? entry.detail : entry.id;
      return [entry.id, isDuplicate ? `${label} (${suffix})` : label];
    }),
  );
}
