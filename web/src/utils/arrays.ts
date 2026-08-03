export function deduplicateBy<TItem, TKey>(
  items: readonly TItem[],
  getKey: (item: TItem) => TKey,
): TItem[] {
  const byKey = new Map<TKey, TItem>();

  for (const item of items) {
    const key = getKey(item);

    if (!byKey.has(key)) {
      byKey.set(key, item);
    }
  }

  return Array.from(byKey.values());
}
