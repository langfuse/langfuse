/**
 * What a lookup of one trace's matches adds to the sample list. Nothing is
 * added until every page is in. A lookup that has failed stays closed, so a
 * retry cannot slot older matches in ahead of a sample chosen without them.
 */
export function resolveTraceMatches<T>({
  traceId,
  isComplete,
  hasFailed,
  pages,
}: {
  /** Null looks nothing up. */
  traceId: string | null;
  isComplete: boolean;
  /** The lookup has failed at least once, whatever happened since. */
  hasFailed: boolean;
  pages: T[][];
}): { samples: T[]; isSettled: boolean } {
  if (traceId === null || hasFailed) return { samples: [], isSettled: true };
  if (!isComplete) return { samples: [], isSettled: false };
  return { samples: pages.flat(), isSettled: true };
}
