/** Earliest start_time for a root of a trace anchored at `windowStart`. */
export function matchingTraceRootLowerBound(
  windowStart: Date,
  intervalDays: number,
): Date {
  return new Date(windowStart.getTime() - intervalDays * 24 * 60 * 60 * 1000);
}

/** Roots in the order their traces matched. Traces with no root are omitted. */
export function orderRootsByMatchedTraceIds<
  T extends { traceId: string | null },
>(traceIds: string[], roots: T[]): T[] {
  const byTraceId = new Map<string, T>();
  for (const root of roots) {
    if (root.traceId != null && !byTraceId.has(root.traceId)) {
      byTraceId.set(root.traceId, root);
    }
  }
  return traceIds.flatMap((traceId) => {
    const root = byTraceId.get(traceId);
    return root ? [root] : [];
  });
}
