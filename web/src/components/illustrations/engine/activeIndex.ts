/** The item a cycling scene shows: the pinned index, rounded and wrapped into range, else the next one each run (the first at rest). A non-finite pin counts as none. */
export function activeIndexOf(
  active: number | undefined,
  runs: number,
  count: number,
) {
  const size = Math.max(1, count);
  if (active !== undefined && Number.isFinite(active))
    return ((Math.round(active) % size) + size) % size;
  return Math.max(0, runs - 1) % size;
}
