import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";
import { type RouterOutputs } from "@/src/utils/api";
import { type ComponentProps } from "react";
import { SessionConversationalView } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/SessionConversationalView";
import {
  type SessionConversationTimelineController,
  type SessionConversationTimelineScrollTarget,
} from "@/src/features/sessions/hooks/useSessionConversationTimelineController";
import { type SessionTraceTranscriptState } from "@/src/features/sessions/hooks/useSessionTraceTranscripts";
import { getSessionTranscriptRows } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/fns/getSessionTranscriptRows";

export type ConnectedSessionConversationTimelineItem = {
  trace: EventSessionTrace;
  turnNumber: number;
  observations: RouterOutputs["events"]["sessionAll"]["observations"];
};

export function ConnectedSessionConversationTimeline(
  props: (
    | { state: "loading" }
    | Omit<
        Extract<
          ComponentProps<typeof SessionConversationalView>,
          { state: "loaded" }
        >,
        "traces" | "controller" | "onLoadMoreObservations"
      >
  ) & {
    traces: readonly ConnectedSessionConversationTimelineItem[];
    projectId: string;
    openPeek: (
      id: string,
      row: EventSessionTrace & { observationId?: string },
    ) => void;
    controller: SessionConversationTimelineController;
    resultsByTraceId: ReadonlyMap<string, SessionTraceTranscriptState>;
    scrollTarget: SessionConversationTimelineScrollTarget | null;
    onLoadMoreObservations?: () => void;
  },
) {
  const {
    traces,
    openPeek,
    controller,
    resultsByTraceId,
    scrollTarget,
    onLoadMoreObservations,
  } = props;

  return (
    <SessionConversationalView
      {...props}
      traces={traces.map(({ trace, turnNumber, observations }) => {
        const result = resultsByTraceId.get(trace.id);
        const state = (() => {
          if (result?.state === "error") return { type: "error" as const };
          if (!result || result.state === "loading")
            return { type: "loading" as const };
          if (getSessionTranscriptRows(result.transcript).length === 0)
            return { type: "empty" as const };
          return { type: "transcript" as const, result, observations };
        })();
        return {
          trace,
          turnNumber,
          state,
          onOpenTrace: () => openPeek(trace.id, trace),
          onOpenObservation: (observationId: string) =>
            openPeek(trace.id, { ...trace, observationId }),
          scrollTarget:
            scrollTarget?.traceId === trace.id ? scrollTarget : null,
        };
      })}
      controller={controller}
      onLoadMoreObservations={onLoadMoreObservations}
    />
  );
}
