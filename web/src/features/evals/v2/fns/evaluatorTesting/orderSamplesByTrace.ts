/**
 * Keeps traces in list order and puts each trace's samples in start order,
 * so stepping walks down one trace before moving to the next.
 */
export function orderSamplesByTrace<
  T extends { id: string; traceId?: string | null; startTime: Date | string },
>(samples: T[]): T[] {
  const byTrace = new Map<string, T[]>();
  for (const sample of samples) {
    const key = sample.traceId ?? sample.id;
    const group = byTrace.get(key);
    if (group) group.push(sample);
    else byTrace.set(key, [sample]);
  }
  return [...byTrace.values()].flatMap((group) =>
    group.toSorted(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    ),
  );
}
