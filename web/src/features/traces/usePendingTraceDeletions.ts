import { useCallback, useEffect, useMemo } from "react";
import {
  ActionId,
  BatchExportTableName,
  type TraceDeleteCandidate,
  type TraceDeletePredicateSource,
} from "@langfuse/shared";
import { api } from "@/src/utils/api";
import {
  settleTraceDeletionQueries,
  usePendingTraceDeletionSnapshot,
} from "@/src/features/traces/pendingTraceDeletions";
import { compilePendingTraceDeletionQuery } from "@/src/features/traces/pendingTraceDeletionMatch";

/**
 * A "no trace delete running" answer only settles entries created at least
 * this long before it arrived, so a poll that was already in flight when the
 * delete was dispatched cannot clear it.
 */
const SETTLE_GRACE_MS = 15_000;
const SETTLE_POLL_INTERVAL_MS = 30_000;

export type PendingTraceDeletions = {
  /**
   * Trace ids to hide among `candidates`: explicit ids plus every trace with a
   * candidate matching a stored select-all delete from the same source.
   */
  hiddenTraceIds: (
    source: TraceDeletePredicateSource,
    candidates: readonly TraceDeleteCandidate[],
  ) => ReadonlySet<string>;
  isTracePending: (
    traceId: string,
    candidates: Partial<
      Record<TraceDeletePredicateSource, readonly TraceDeleteCandidate[]>
    >,
  ) => boolean;
};

export function usePendingTraceDeletions(
  projectId: string,
): PendingTraceDeletions {
  const { ids, queries } = usePendingTraceDeletionSnapshot(projectId);

  const predicates = useMemo(
    () =>
      queries.flatMap((entry) => {
        const compiled = compilePendingTraceDeletionQuery(entry);
        return compiled.supported ? [compiled] : [];
      }),
    [queries],
  );

  const inProgress = api.table.getIsBatchActionInProgress.useQuery(
    {
      projectId,
      actionId: ActionId.TraceDelete,
      tableName: BatchExportTableName.Traces,
    },
    {
      enabled: queries.length > 0,
      refetchInterval: SETTLE_POLL_INTERVAL_MS,
    },
  );

  useEffect(() => {
    if (inProgress.data !== false || inProgress.dataUpdatedAt === 0) return;
    settleTraceDeletionQueries(
      projectId,
      inProgress.dataUpdatedAt - SETTLE_GRACE_MS,
    );
  }, [inProgress.data, inProgress.dataUpdatedAt, projectId]);

  const hiddenTraceIds = useCallback(
    (
      source: TraceDeletePredicateSource,
      candidates: readonly TraceDeleteCandidate[],
    ): ReadonlySet<string> => {
      const forSource = predicates.filter((p) => p.source === source);
      if (forSource.length === 0) return ids;
      const hidden = new Set(ids);
      for (const candidate of candidates) {
        if (hidden.has(candidate.traceId)) continue;
        if (forSource.some((p) => p.matches(candidate))) {
          hidden.add(candidate.traceId);
        }
      }
      return hidden;
    },
    [ids, predicates],
  );

  const isTracePending = useCallback(
    (
      traceId: string,
      candidates: Partial<
        Record<TraceDeletePredicateSource, readonly TraceDeleteCandidate[]>
      >,
    ) =>
      ids.has(traceId) ||
      predicates.some((p) =>
        (candidates[p.source] ?? []).some((candidate) => p.matches(candidate)),
      ),
    [ids, predicates],
  );

  return useMemo(
    () => ({ hiddenTraceIds, isTracePending }),
    [hiddenTraceIds, isTracePending],
  );
}
