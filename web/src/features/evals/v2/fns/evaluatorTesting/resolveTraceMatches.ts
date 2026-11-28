/**
 * What a lookup of one trace's matches adds to the sample list. Nothing is
 * added until every page is in. Matches that loaded stay, also when a later
 * refetch fails; a lookup that fails before it completes adds nothing.
 */
export function resolveTraceMatches<T>({
  traceId,
  isComplete,
  hasFailed,
  pages,
}: {
  /** Null looks nothing up. */
  traceId: string | null;
  /** Every page is loaded, whatever the latest fetch did. */
  isComplete: boolean;
  /** The latest fetch failed. */
  hasFailed: boolean;
  pages: T[][];
}): { samples: T[]; isSettled: boolean } {
  if (traceId === null) return { samples: [], isSettled: true };
  if (isComplete) return { samples: pages.flat(), isSettled: true };
  return { samples: [], isSettled: hasFailed };
}
