/**
 * useSelectedObservation - resolves the selected node WITHOUT the trace tree.
 *
 * The trace's observation list is capped (MAX_OBSERVATIONS_PER_TRACE), so an
 * observation can be selectable (peek/deep link from the observations table)
 * while being absent from the loaded list — and therefore from the tree and its
 * nodeMap. Tree drawability must not decide what the data panel shows, so the
 * row is resolved from the loaded list when present (fast path, no extra
 * request) and fetched by id otherwise.
 */

import { useMemo } from "react";
import { api } from "@/src/utils/api";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { traceNodeId } from "@/src/features/traces/fns/treeBuilding";

export type SelectedObservation =
  | { kind: "trace" }
  | { kind: "loading"; observationId: string }
  | { kind: "not-found"; observationId: string }
  | { kind: "error"; observationId: string }
  | {
      kind: "observation";
      observation: ObservationReturnTypeWithMetadata;
      /** Resolved by id: the row is outside the loaded (capped) list. */
      isOutsideLoadedList: boolean;
    };

export function useSelectedObservation({
  selectedNodeId,
  traceId,
  projectId,
  observations,
}: {
  selectedNodeId: string | null;
  traceId: string;
  projectId: string;
  observations: ObservationReturnTypeWithMetadata[];
}): SelectedObservation {
  // A loaded row wins over the synthetic trace-node id shape: observation ids
  // are caller-supplied, so an observation really can be called
  // `trace-<traceId>`, and a real row is the stronger evidence.
  const loadedRow = useMemo(
    () =>
      selectedNodeId
        ? observations.find(
            (obs) => obs.id === selectedNodeId && obs.traceId === traceId,
          )
        : undefined,
    [observations, selectedNodeId, traceId],
  );

  // Otherwise derived from the id alone, never from a nodeMap hit: past the cap
  // the lookup misses, and reading that as "the trace is selected" is the bug
  // this hook fixes.
  //
  // The id shape stays the tiebreaker for an id NOT in the list, which trades
  // two edge cases against each other: a v3-dialect URL (`observation=trace-<id>`)
  // opened against a v4 trace, which has no TRACE node to match, still resolves
  // to the trace — at the price of an observation deliberately NAMED
  // `trace-<its own trace id>` and sitting past the cap showing the trace
  // instead. Cross-dialect links are a real, documented case
  // (resolvePeekTraceParams); that naming collision is not.
  const observationId =
    !selectedNodeId || (!loadedRow && selectedNodeId === traceNodeId(traceId))
      ? null
      : selectedNodeId;

  // `compact` keeps this row lean — the detail view fetches full I/O separately
  // (useParsedObservation) once it has the row.
  const byId = api.observations.byId.useQuery(
    {
      observationId: observationId ?? "",
      traceId,
      projectId,
      verbosity: "compact",
    },
    {
      enabled: !!observationId && !loadedRow,
      staleTime: 5 * 60 * 1000,
      // The panel renders the missing-observation state itself; a global error
      // toast on top of it would just be alarming noise.
      meta: { silentHttpCodes: [404] },
    },
  );

  // Transport-level failures (proxy error page, dropped connection, a body that
  // is not JSON) carry no `data.code`, so the presence of an error — not its
  // code — is what ends the wait. Keying on the code alone left the panel on a
  // skeleton forever.
  const hasError = !!byId.error;
  const isNotFound = byId.error?.data?.code === "NOT_FOUND";

  return useMemo(() => {
    if (!observationId) return { kind: "trace" };
    if (loadedRow)
      return {
        kind: "observation",
        observation: loadedRow,
        isOutsideLoadedList: false,
      };
    if (byId.data)
      return {
        kind: "observation",
        // traceId is nullable on the by-id row; the fetch was scoped to this
        // trace, so the selected observation belongs to it by construction.
        observation: { ...byId.data, traceId: byId.data.traceId ?? traceId },
        isOutsideLoadedList: true,
      };
    // A transient failure is not a missing observation — mislabeling it would
    // repeat the class of bug this hook exists to fix.
    if (hasError) {
      return {
        kind: isNotFound ? "not-found" : "error",
        observationId,
      };
    }
    return { kind: "loading", observationId };
  }, [observationId, loadedRow, byId.data, hasError, isNotFound, traceId]);
}
