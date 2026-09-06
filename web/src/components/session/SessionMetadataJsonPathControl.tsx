import { type FilterState } from "@langfuse/shared";
import {
  hashKey,
  type QueryCache,
  useQueryClient,
} from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import {
  type ReactNode,
  useCallback,
  useState,
  useSyncExternalStore,
} from "react";

import {
  metadataJsonPathsStorageKey,
  parseStoredMetadataJsonPaths,
  type SessionMetadataJsonPathState,
} from "@/src/components/session/sessionMetadataJsonPath";
import { getVisibleSessionObservations } from "@/src/components/session/sessionVisibleObservations";
import useLocalStorage from "@/src/components/useLocalStorage";
import { api, type RouterOutputs } from "@/src/utils/api";

type SessionMetadataJsonPathControlProps = {
  projectId: string;
  sessionId: string;
  traces:
    | { state: "loading" }
    | { state: "loaded"; data: readonly { id: string }[] };
  filterState: FilterState;
  children: (state: SessionMetadataJsonPathState) => ReactNode;
};

const EMPTY_STORED_PATHS: readonly string[] = [];
const EMPTY_CACHE_SNAPSHOT = () => "";

const getQueryCacheSnapshot = (
  queryCache: QueryCache,
  queryHashSignature: string,
) => {
  if (!queryHashSignature) return "";

  return queryHashSignature
    .split("\u0000")
    .map((queryHash) => {
      const state = queryCache.get(queryHash)?.state;
      return state
        ? `${state.status}:${state.fetchStatus}:${state.dataUpdateCount}:${state.errorUpdateCount}`
        : "missing";
    })
    .join("\u0000");
};

const useQueryCacheEntries = (queryHashSignature: string) => {
  const queryCache = useQueryClient().getQueryCache();
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const queryHashes = new Set(queryHashSignature.split("\u0000"));
      return queryCache.subscribe((event) => {
        if (queryHashes.has(event.query.queryHash)) onStoreChange();
      });
    },
    [queryCache, queryHashSignature],
  );
  const getSnapshot = useCallback(
    () => getQueryCacheSnapshot(queryCache, queryHashSignature),
    [queryCache, queryHashSignature],
  );

  useSyncExternalStore(subscribe, getSnapshot, EMPTY_CACHE_SNAPSHOT);
  return queryCache;
};

const getFirstCachedObservation = ({
  queryCache,
  queryHashes,
  traceIds,
}: {
  queryCache: QueryCache;
  queryHashes: readonly string[];
  traceIds: readonly string[];
}) => {
  type Observation =
    RouterOutputs["sessions"]["observationsForTraceFromEvents"][number];
  type ObservationResponse =
    | RouterOutputs["sessions"]["observationsForTraceFromEvents"]
    | {
        observations?: RouterOutputs["sessions"]["observationsForTraceFromEvents"];
      };
  let firstObservation: Observation | undefined;
  let hasResolvedQuery = false;
  let isFetching = false;
  let isError = false;

  queryHashes.forEach((queryHash, index) => {
    const queryState = queryCache.get(queryHash)?.state;
    const response = queryState?.data as ObservationResponse | undefined;
    hasResolvedQuery ||= response !== undefined;
    isFetching ||= queryState?.fetchStatus === "fetching";
    isError ||= queryState?.status === "error";
    firstObservation ??= getVisibleSessionObservations(
      response,
      traceIds[index] ?? "",
    ).visibleObservations?.[0];
  });

  return { firstObservation, hasResolvedQuery, isFetching, isError };
};

export function SessionMetadataJsonPathControl({
  projectId,
  sessionId,
  traces,
  filterState,
  children,
}: SessionMetadataJsonPathControlProps) {
  const [rawPaths, setRawPaths] = useLocalStorage<unknown>(
    metadataJsonPathsStorageKey(projectId),
    EMPTY_STORED_PATHS,
  );
  const paths = parseStoredMetadataJsonPaths(rawPaths);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const shouldObserveMetadata = paths.length > 0 || isEditorOpen;
  const loadedTraces = traces.state === "loaded" ? traces.data : [];
  const observationInputs = shouldObserveMetadata
    ? loadedTraces.map((trace) => ({
        projectId,
        sessionId,
        traceId: trace.id,
        filter: filterState,
      }))
    : [];
  const observationQueryHashes = observationInputs.map((input) =>
    hashKey(
      getQueryKey(api.sessions.observationsForTraceFromEvents, input, "query"),
    ),
  );
  const queryCache = useQueryCacheEntries(
    observationQueryHashes.join("\u0000"),
  );
  const { firstObservation, hasResolvedQuery, isFetching, isError } =
    getFirstCachedObservation({
      queryCache,
      queryHashes: observationQueryHashes,
      traceIds: loadedTraces.map((trace) => trace.id),
    });
  const source = !shouldObserveMetadata
    ? ({ state: "idle" } as const)
    : traces.state === "loading"
      ? ({ state: "loading" } as const)
      : firstObservation
        ? ({
            state: "ready",
            metadata: firstObservation.metadata,
            metadataTruncated: firstObservation.metadataTruncated,
          } as const)
        : isFetching
          ? ({ state: "loading" } as const)
          : isError && !hasResolvedQuery
            ? ({ state: "error" } as const)
            : hasResolvedQuery || loadedTraces.length === 0
              ? ({ state: "empty" } as const)
              : ({ state: "loading" } as const);

  return children({
    paths,
    source,
    onEditorOpenChange: setIsEditorOpen,
    onSave: (path) => {
      setRawPaths((current: unknown) => {
        const currentPaths = parseStoredMetadataJsonPaths(current);
        return currentPaths.includes(path)
          ? currentPaths
          : [...currentPaths, path];
      });
    },
    onRemove: (path) => {
      setRawPaths((current: unknown) =>
        parseStoredMetadataJsonPaths(current).filter((item) => item !== path),
      );
    },
  });
}
