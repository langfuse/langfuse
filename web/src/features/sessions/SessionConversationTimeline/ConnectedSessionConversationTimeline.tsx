import { type FilterState } from "@langfuse/shared";
import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";
import { api, type RouterOutputs } from "@/src/utils/api";
import { AnnotateDrawerController } from "@/src/features/scores";
import { CommentDrawerController } from "@/src/features/comments";
import { NewDatasetItemFromExistingObjectDialogController } from "@/src/features/datasets";
import { useHasProjectAccess } from "@/src/features/rbac";
import { showErrorToast } from "@/src/features/notifications";
import { SessionConversationTimeline } from "./SessionConversationTimeline";
import {
  type SessionConversationTimelineController,
  type SessionConversationTimelineScrollTarget,
} from "./useSessionConversationTimelineController";
import {
  SessionConversationTimelineTrace,
  type SessionObservationActions,
} from "./components/SessionConversationTimelineTrace/SessionConversationTimelineTrace";
import { useSessionTraceTranscripts } from "./useSessionTraceTranscripts";

export type ConnectedSessionConversationTimelineItem = {
  trace: EventSessionTrace;
  turnNumber: number;
  observations:
    | RouterOutputs["events"]["sessionAll"]["observations"]
    | null
    | undefined;
};

export function ConnectedSessionConversationTimeline({
  traces,
  projectId,
  filterMeasurementKey,
  viewLabel,
  filterState,
  openPeek,
  controller,
  activeTraceIds,
  scrollTarget,
  onClearFilters,
  onFilterObservationByName,
  onLoadMoreObservations,
}: {
  traces: readonly ConnectedSessionConversationTimelineItem[];
  projectId: string;
  filterState: FilterState;
  filterMeasurementKey: string;
  viewLabel: string | null;
  openPeek: (
    id: string,
    row: EventSessionTrace & { observationId?: string },
  ) => void;
  controller: SessionConversationTimelineController;
  activeTraceIds: ReadonlySet<string>;
  scrollTarget: SessionConversationTimelineScrollTarget | null;
  onClearFilters: () => void;
  onFilterObservationByName: (
    name: string,
    operator: "any of" | "none of",
  ) => void;
  onLoadMoreObservations?: () => void;
}) {
  const resultsByTraceId = useSessionTraceTranscripts({
    projectId,
    traces,
    activeTraceIds,
  });
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
                <SessionConversationTimeline
                  traces={traces.map(({ trace, turnNumber, observations }) => {
                    const result = resultsByTraceId.get(trace.id);
                    const state = (() => {
                      if (observations === null) {
                        return { type: "error" as const };
                      }
                      if (observations === undefined) {
                        return { type: "loading" as const };
                      }
                      if (observations.length === 0) {
                        if (filterState.length === 0)
                          return { type: "empty" as const };
                        return {
                          type: "filtered-empty" as const,
                          viewLabel,
                          onClearFilters,
                        };
                      }
                      if (result?.state === "error")
                        return { type: "error" as const };
                      if (!result || result.state === "loading")
                        return { type: "loading" as const };
                      return {
                        type: "transcript" as const,
                        result,
                        observations,
                        filtered: filterState.length > 0,
                        observationActions: {
                          onFilterByName: onFilterObservationByName,
                          annotate: {
                            disabled: annotateDisabled,
                            onSelect: (
                              observation: Parameters<
                                SessionObservationActions["annotate"]["onSelect"]
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
                          },
                          comment: {
                            disabled: commentDisabled,
                            onSelect: (
                              observation: Parameters<
                                SessionObservationActions["comment"]["onSelect"]
                              >[0],
                            ) =>
                              openCommentDrawer({
                                type: "comments",
                                objectId: observation.id,
                                objectType: "OBSERVATION",
                                objectStartTime: observation.startTime,
                              }),
                          },
                          addToDataset: {
                            disabled: !hasDatasetAccess,
                            onSelect: async (
                              observation: Parameters<
                                SessionObservationActions["addToDataset"]["onSelect"]
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
                          },
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
                  TraceComponent={SessionConversationTimelineTrace}
                  filterMeasurementKey={`${filterMeasurementKey}:transcript`}
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
