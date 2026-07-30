import { useMemo } from "react";
import { type FilterState } from "@langfuse/shared";

import {
  ModernSessionSidebar,
  type ModernSessionSidebarFilterControls,
} from "@/src/components/session/ModernSessionSidebar";
import {
  ObservationListRows,
  type ObservationListRowsRenderer,
} from "@/src/components/session/ObservationListRows";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";
import { type SessionTraceObservation } from "@/src/components/session/SessionObservationIO";
import { api, type RouterOutputs } from "@/src/utils/api";

type ObservationsResponse =
  RouterOutputs["sessions"]["observationsForTraceFromEvents"];

const asObservationArray = (
  data: unknown,
): SessionTraceObservation[] | undefined =>
  Array.isArray(data)
    ? (data as ObservationsResponse)
    : ((data as { observations?: ObservationsResponse } | undefined)
        ?.observations ?? undefined);

function ConnectedObservationRows({
  projectId,
  sessionId,
  filterState,
  traceId,
  search,
  onSelectTurn,
  onExcludeObservation,
}: Parameters<ObservationListRowsRenderer>[0] & {
  projectId: string;
  sessionId: string;
  filterState: FilterState;
  onExcludeObservation: (name: string) => void;
}) {
  const observationsQuery =
    api.sessions.observationsForTraceFromEvents.useQuery(
      { projectId, sessionId, traceId, filter: filterState },
      { trpc: { context: { skipBatch: true } }, staleTime: 60 * 1000 },
    );

  const rows = useMemo(() => {
    const all = asObservationArray(observationsQuery.data);
    if (!all) return undefined;
    const query = search.trim().toLowerCase();
    return all
      .filter((observation) => observation.id !== `t-${traceId}`)
      .filter(
        (observation) =>
          query === "" ||
          (observation.name ?? "").toLowerCase().includes(query),
      );
  }, [observationsQuery.data, search, traceId]);

  if (observationsQuery.isLoading) {
    return <ObservationListRows state={{ type: "loading" }} />;
  }

  if (!rows || rows.length === 0) {
    return (
      <ObservationListRows
        state={{
          type: "empty",
          hasFilters: search.trim() !== "" || filterState.length > 0,
        }}
      />
    );
  }

  return (
    <ObservationListRows
      state={{ type: "loaded", rows }}
      onSelectTurn={onSelectTurn}
      onExcludeObservation={onExcludeObservation}
    />
  );
}

export function ConnectedModernSessionSidebar({
  state,
  projectId,
  sessionId,
  filterState,
  filterControls,
  onExcludeObservation,
}: {
  state:
    | { type: "loading" }
    | {
        type: "loaded";
        traces: EventSessionTrace[];
        activeTraceId: string | undefined;
        onSelect: (index: number) => void;
      };
  projectId: string;
  sessionId: string;
  filterState: FilterState;
  filterControls: ModernSessionSidebarFilterControls;
  onExcludeObservation: (name: string) => void;
}) {
  if (state.type === "loading") {
    return <ModernSessionSidebar state="loading" />;
  }

  const { traces, activeTraceId, onSelect } = state;

  return (
    <ModernSessionSidebar
      state="loaded"
      traces={traces}
      activeTraceId={activeTraceId}
      filterControls={filterControls}
      renderObservationRows={(props) => (
        <ConnectedObservationRows
          {...props}
          projectId={projectId}
          sessionId={sessionId}
          filterState={filterState}
          onExcludeObservation={onExcludeObservation}
        />
      )}
      onSelect={onSelect}
    />
  );
}
