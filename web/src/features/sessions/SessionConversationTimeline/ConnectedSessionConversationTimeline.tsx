import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";
import { api, type RouterOutputs } from "@/src/utils/api";
import { AnnotateDrawerController } from "@/src/features/scores";
import { CommentDrawerController } from "@/src/features/comments";
import { NewDatasetItemFromExistingObjectDialogController } from "@/src/features/datasets";
import { useHasProjectAccess } from "@/src/features/rbac";
import { showErrorToast } from "@/src/features/notifications";
import { type ComponentProps } from "react";
import { SessionConversationalView } from "../SessionConversationalView/SessionConversationalView";
import {
  type SessionConversationTimelineController,
  type SessionConversationTimelineScrollTarget,
} from "./useSessionConversationTimelineController";
import { type SessionObservationActionsMenuContent } from "./components/SessionConversationTimelineTrace/SessionConversationTimelineTrace";
import { type SessionTraceTranscriptState } from "./useSessionTraceTranscripts";
import { getSessionTranscriptRows } from "./fns/getSessionTranscriptRows";

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
    projectId,
    openPeek,
    controller,
    resultsByTraceId,
    scrollTarget,
    onLoadMoreObservations,
  } = props;
  const utils = api.useUtils();
  const hasDatasetAccess = useHasProjectAccess({
    projectId,
    scope: "datasets:CUD",
  });

  return (
    <AnnotateDrawerController projectId={projectId}>
      {({ disabled: annotateDisabled, openDrawer: openAnnotateDrawer }) => (
        <CommentDrawerController projectId={projectId} mode="read-only">
          {({ disabled: commentDisabled, openDrawer: openCommentDrawer }) => (
            <NewDatasetItemFromExistingObjectDialogController
              projectId={projectId}
            >
              {({ openDialog: openDatasetDialog }) => (
                <SessionConversationalView
                  {...props}
                  traces={traces.map(({ trace, turnNumber, observations }) => {
                    const result = resultsByTraceId.get(trace.id);
                    const state = (() => {
                      if (result?.state === "error")
                        return { type: "error" as const };
                      if (!result || result.state === "loading")
                        return { type: "loading" as const };
                      if (
                        getSessionTranscriptRows(result.transcript).length === 0
                      )
                        return { type: "empty" as const };
                      return {
                        type: "transcript" as const,
                        result,
                        observations,
                        annotateDisabled,
                        commentDisabled,
                        addToDatasetDisabled: !hasDatasetAccess,
                        onAnnotateObservation: (
                          observation: Parameters<
                            ComponentProps<
                              typeof SessionObservationActionsMenuContent
                            >["onAnnotateObservation"]
                          >[0],
                        ) =>
                          openAnnotateDrawer({
                            scoreTarget: {
                              type: "trace",
                              traceId: observation.traceId,
                              observationId: observation.id,
                            },
                            analyticsData: {
                              type: "trace",
                              source: "SessionDetail",
                              isV4: true,
                            },
                            scoreMetadata: {
                              projectId,
                              environment: observation.environment,
                            },
                          }),
                        onCommentObservation: (
                          observation: Parameters<
                            ComponentProps<
                              typeof SessionObservationActionsMenuContent
                            >["onCommentObservation"]
                          >[0],
                        ) =>
                          openCommentDrawer({
                            type: "comments",
                            objectId: observation.id,
                            objectType: "OBSERVATION",
                            objectStartTime: observation.startTime,
                          }),
                        onAddObservationToDataset: async (
                          observation: Parameters<
                            ComponentProps<
                              typeof SessionObservationActionsMenuContent
                            >["onAddObservationToDataset"]
                          >[0],
                        ) => {
                          try {
                            const [fullObservation] =
                              await utils.events.batchIO.fetch({
                                projectId,
                                traceId: observation.traceId,
                                observations: [
                                  {
                                    id: observation.id,
                                    traceId: observation.traceId,
                                  },
                                ],
                                minStartTime: observation.startTime,
                                maxStartTime: observation.startTime,
                                truncated: false,
                              });
                            if (!fullObservation) throw new Error();
                            openDatasetDialog({
                              traceId: observation.traceId,
                              observationId: observation.id,
                              input: fullObservation.input,
                              output: fullObservation.output,
                              metadata: fullObservation.metadata,
                            });
                          } catch {
                            showErrorToast(
                              "Failed to load observation",
                              "Could not fetch the observation's full I/O. Please try again.",
                            );
                          }
                        },
                      };
                    })();
                    return {
                      trace,
                      turnNumber,
                      state,
                      onOpenTrace: () => openPeek(trace.id, trace),
                      onOpenObservation: (observationId: string) =>
                        openPeek(trace.id, { ...trace, observationId }),
                      scrollTarget:
                        scrollTarget?.traceId === trace.id
                          ? scrollTarget
                          : null,
                    };
                  })}
                  controller={controller}
                  onLoadMoreObservations={onLoadMoreObservations}
                />
              )}
            </NewDatasetItemFromExistingObjectDialogController>
          )}
        </CommentDrawerController>
      )}
    </AnnotateDrawerController>
  );
}
