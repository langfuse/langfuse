import { type FilterState } from "@langfuse/shared";

import { SessionConversationTimeline } from "@/src/components/session/SessionConversationTimeline";
import { getVisibleSessionObservations } from "@/src/components/session/sessionVisibleObservations";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";
import { api, type RouterOutputs } from "@/src/utils/api";

export function ConnectedSessionConversationTimeline({
  trace,
  projectId,
  sessionId,
  filterState,
  viewLabel,
  showSystemPrompt,
  openPeek,
}: {
  trace: EventSessionTrace;
  projectId: string;
  sessionId: string;
  filterState: FilterState;
  viewLabel: string | null;
  showSystemPrompt: boolean;
  openPeek: (
    id: string,
    row: EventSessionTrace & { observationId?: string },
  ) => void;
}) {
  const observationsQuery =
    api.sessions.observationsForTraceFromEvents.useQuery(
      { projectId, sessionId, traceId: trace.id, filter: filterState },
      {
        enabled: Boolean(trace.id),
        trpc: { context: { skipBatch: true } },
        staleTime: 60 * 1000,
      },
    );
  const observationsData = observationsQuery.data as
    | RouterOutputs["sessions"]["observationsForTraceFromEvents"]
    | {
        observations?: RouterOutputs["sessions"]["observationsForTraceFromEvents"];
      }
    | undefined;
  const { visibleObservations, hasMoreObservations } =
    getVisibleSessionObservations(observationsData, trace.id);

  const state = observationsQuery.isLoading
    ? ({ type: "loading" } as const)
    : observationsQuery.isError
      ? ({ type: "error" } as const)
      : visibleObservations && visibleObservations.length > 0
        ? ({
            type: "loaded",
            observations: visibleObservations,
            hasMoreObservations,
          } as const)
        : ({
            type: "empty",
            message:
              filterState.length === 0
                ? "This trace has no observations."
                : viewLabel
                  ? `No observation matches the “${viewLabel}” view in this trace.`
                  : "No observation matches the current filters in this trace.",
          } as const);

  return (
    <SessionConversationTimeline
      trace={trace}
      state={state}
      showSystemPrompt={showSystemPrompt}
      onOpenTrace={() => openPeek(trace.id, trace)}
      onOpenObservation={(observationId) =>
        openPeek(trace.id, { ...trace, observationId })
      }
    />
  );
}
