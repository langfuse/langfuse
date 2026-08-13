import { useQuery } from "@tanstack/react-query";
import { type FilterState } from "@langfuse/shared";
import { useState } from "react";

import { SessionMetadataJsonPathControlView } from "@/src/components/session/SessionMetadataJsonPathControlView";
import useLocalStorage from "@/src/components/useLocalStorage";
import {
  findFirstVisibleSessionObservation,
  metadataJsonPathsStorageKey,
  parseStoredMetadataJsonPaths,
} from "@/src/components/session/sessionMetadataJsonPath";
import { api } from "@/src/utils/api";

type SessionMetadataJsonPathControlProps = {
  projectId: string;
  sessionId: string;
  traces:
    | { state: "loading" }
    | { state: "loaded"; data: readonly { id: string }[] };
  filterState: FilterState;
  filterKey: string;
};

const FIRST_OBSERVATION_STALE_TIME_MS = 60 * 1_000;

export function SessionMetadataJsonPathControl({
  projectId,
  sessionId,
  traces,
  filterState,
  filterKey,
}: SessionMetadataJsonPathControlProps) {
  const utils = api.useUtils();
  const [rawConfiguration, setRawConfiguration, clearRawConfiguration] =
    useLocalStorage<unknown>(metadataJsonPathsStorageKey(projectId), null);
  const storedConfiguration = parseStoredMetadataJsonPaths(rawConfiguration);
  const paths = storedConfiguration?.paths ?? [];
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const shouldResolveFirstObservation = paths.length > 0 || isEditorOpen;
  const traceIds =
    traces.state === "loaded" ? traces.data.map((trace) => trace.id) : [];

  const firstObservationQuery = useQuery({
    queryKey: [
      "session-metadata-jsonpath-first-observation",
      projectId,
      sessionId,
      filterKey,
      traceIds,
    ],
    enabled: traces.state === "loaded" && shouldResolveFirstObservation,
    staleTime: FIRST_OBSERVATION_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: ({ signal }) => {
      if (traces.state !== "loaded") return null;

      return findFirstVisibleSessionObservation({
        traces: traces.data,
        signal,
        loadObservations: (traceId) =>
          utils.sessions.observationsForTraceFromEvents.fetch(
            {
              projectId,
              sessionId,
              traceId,
              filter: filterState,
            },
            {
              staleTime: FIRST_OBSERVATION_STALE_TIME_MS,
              trpc: { context: { skipBatch: true } },
            },
          ),
      });
    },
  });

  const source = !shouldResolveFirstObservation
    ? ({ state: "idle" } as const)
    : traces.state === "loading" || firstObservationQuery.isPending
      ? ({ state: "loading" } as const)
      : firstObservationQuery.isError
        ? ({ state: "error" } as const)
        : firstObservationQuery.data
          ? ({
              state: "ready",
              metadata: firstObservationQuery.data.metadata,
              metadataTruncated: firstObservationQuery.data.metadataTruncated,
            } as const)
          : ({ state: "empty" } as const);

  return (
    <SessionMetadataJsonPathControlView
      key={paths.length > 0 ? JSON.stringify(paths) : "empty"}
      paths={paths}
      source={source}
      isEditorOpen={isEditorOpen}
      onEditorOpenChange={setIsEditorOpen}
      onSave={(path) => {
        if (!paths.includes(path)) {
          setRawConfiguration({ version: 1, paths: [...paths, path] });
        }
        setIsEditorOpen(false);
      }}
      onRemove={(path) => {
        const remainingPaths = paths.filter((item) => item !== path);
        if (remainingPaths.length > 0) {
          setRawConfiguration({ version: 1, paths: remainingPaths });
        } else {
          clearRawConfiguration();
        }
        setIsEditorOpen(false);
      }}
    />
  );
}
