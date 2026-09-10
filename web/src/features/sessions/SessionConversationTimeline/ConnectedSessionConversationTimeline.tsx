import { useCallback, useMemo } from "react";
import { type FilterState } from "@langfuse/shared";

import {
  SessionConversationTimeline,
  type SessionConversationTimelineController,
  type SessionConversationTimelineScrollTarget,
} from "@/src/features/sessions/SessionConversationTimeline/SessionConversationTimeline";
import { type SessionObservation } from "@/src/features/sessions/SessionConversationTimeline/components/SessionConversationTimelineTrace/SessionConversationTimelineTrace";
import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";
import { AnnotateDrawerController } from "@/src/features/scores/components/AnnotateDrawerController";
import { CommentDrawerController } from "@/src/features/comments/CommentDrawerController";
import { NewDatasetItemFromExistingObjectDialogController } from "@/src/features/datasets/components/NewDatasetItemFromExistingObjectDialogController";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api, sendAsPostOption, type RouterOutputs } from "@/src/utils/api";

const BATCH_IO_SIZE = 500;

type EventObservation = RouterOutputs["events"]["all"]["observations"][number];
type SessionBatchIOQueryResult = {
  data: RouterOutputs["events"]["sessionBatchIO"] | undefined;
  isError: boolean;
  isPending: boolean;
};

const getObservationKey = (traceId: string, observationId: string) =>
  `${traceId}\0${observationId}`;

export type ConnectedSessionConversationTimelineItem = {
  trace: EventSessionTrace;
  turnNumber: number;
  observations: EventObservation[] | null | undefined;
};

export function ConnectedSessionConversationTimeline({
  traces,
  projectId,
  sessionId,
  filterState,
  filterMeasurementKey,
  viewLabel,
  openPeek,
  controller,
  scrollTarget,
  onFilterObservationByName,
  onLoadMoreObservations,
}: {
  traces: readonly ConnectedSessionConversationTimelineItem[];
  projectId: string;
  sessionId: string;
  filterState: FilterState;
  filterMeasurementKey: string;
  viewLabel: string | null;
  openPeek: (
    id: string,
    row: EventSessionTrace & { observationId?: string },
  ) => void;
  controller: SessionConversationTimelineController;
  scrollTarget: SessionConversationTimelineScrollTarget | null;
  onFilterObservationByName: (
    name: string,
    operator: "any of" | "none of",
  ) => void;
  onLoadMoreObservations?: () => void;
}) {
  const utils = api.useUtils();
  const hasDatasetAccess = useHasProjectAccess({
    projectId,
    scope: "datasets:CUD",
  });
  const observationRefs = useMemo(
    () =>
      traces.flatMap(
        ({ trace, observations }) =>
          observations?.map((observation) => ({
            observation,
            traceId: trace.id,
          })) ?? [],
      ),
    [traces],
  );
  const batches = useMemo(() => {
    const nextBatches: (typeof observationRefs)[] = [];
    for (
      let index = 0;
      index < observationRefs.length;
      index += BATCH_IO_SIZE
    ) {
      nextBatches.push(observationRefs.slice(index, index + BATCH_IO_SIZE));
    }
    return nextBatches;
  }, [observationRefs]);

  const combineIOQueries = useCallback(
    (results: readonly SessionBatchIOQueryResult[]) =>
      results.map(({ data, isError, isPending }) => ({
        data,
        isError,
        isPending,
      })),
    [],
  );

  const ioQueries = api.useQueries(
    (t) =>
      batches.map((batch) => {
        const timestamps = batch.map(({ observation }) =>
          observation.startTime.getTime(),
        );
        return t.events.sessionBatchIO(
          {
            projectId,
            sessionId,
            observations: batch.map(({ observation, traceId }) => ({
              id: observation.id,
              traceId,
            })),
            minStartTime: new Date(Math.min(...timestamps)),
            maxStartTime: new Date(Math.max(...timestamps)),
            truncated: false,
            ioCharLimit: 10_000,
          },
          {
            ...sendAsPostOption,
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        );
      }),
    { combine: combineIOQueries },
  );

  const hydratedObservationGroups = useMemo(() => {
    const ioByObservationKey = new Map<
      string,
      RouterOutputs["events"]["sessionBatchIO"][number]
    >();
    const queryIndexByObservationKey = new Map<string, number>();
    batches.forEach((batch, queryIndex) => {
      batch.forEach(({ observation, traceId }) => {
        const observationKey = getObservationKey(traceId, observation.id);
        queryIndexByObservationKey.set(observationKey, queryIndex);
      });
      for (const io of ioQueries[queryIndex]?.data ?? []) {
        ioByObservationKey.set(getObservationKey(io.traceId, io.id), io);
      }
    });

    return traces.map(({ trace, observations }) => {
      if (observations === undefined || observations === null)
        return observations;

      const queryIndices = new Set(
        observations.flatMap((observation) => {
          const queryIndex = queryIndexByObservationKey.get(
            getObservationKey(trace.id, observation.id),
          );
          return queryIndex === undefined ? [] : [queryIndex];
        }),
      );
      if (
        Array.from(queryIndices).some(
          (queryIndex) => ioQueries[queryIndex]?.isError,
        )
      ) {
        return null;
      }
      if (
        Array.from(queryIndices).some(
          (queryIndex) => ioQueries[queryIndex]?.isPending,
        )
      ) {
        return undefined;
      }

      return observations.map((observation) => {
        const io = ioByObservationKey.get(
          getObservationKey(trace.id, observation.id),
        );
        return {
          ...observation,
          traceId: trace.id,
          input: io?.input ?? null,
          output: io?.output ?? null,
          metadata: io?.metadata ?? null,
        } satisfies SessionObservation;
      });
    });
  }, [batches, ioQueries, traces]);
  const timelineTraces = useMemo(
    () =>
      traces.map((timelineTrace, traceIndex) => ({
        ...timelineTrace,
        observations: hydratedObservationGroups[traceIndex],
      })),
    [hydratedObservationGroups, traces],
  );
  const emptyMessage =
    filterState.length === 0
      ? "This trace has no observations."
      : viewLabel
        ? `No observation matches the “${viewLabel}” view in this trace.`
        : "No observation matches the current filters in this trace.";

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
                  traces={timelineTraces}
                  filterMeasurementKey={filterMeasurementKey}
                  emptyMessage={emptyMessage}
                  onOpenTrace={(trace) => openPeek(trace.id, trace)}
                  onOpenObservation={(trace, observationId) =>
                    openPeek(trace.id, { ...trace, observationId })
                  }
                  controller={controller}
                  scrollTarget={scrollTarget}
                  observationActions={{
                    onFilterByName: onFilterObservationByName,
                    annotate: {
                      disabled: annotateDisabled,
                      onSelect: (observation) =>
                        openAnnotateDrawer({
                          scoreTarget: {
                            type: "trace",
                            traceId: observation.traceId,
                            observationId: observation.id,
                          },
                          analyticsData: {
                            type: "trace",
                            source: "SessionDetail",
                          },
                          scoreMetadata: {
                            projectId,
                            environment: observation.environment,
                          },
                        }),
                    },
                    comment: {
                      disabled: commentDisabled,
                      onSelect: (observation) =>
                        openCommentDrawer({
                          type: "comments",
                          objectId: observation.id,
                          objectType: "OBSERVATION",
                          objectStartTime: observation.startTime,
                        }),
                    },
                    addToDataset: {
                      disabled: !hasDatasetAccess,
                      onSelect: async (observation) => {
                        try {
                          // Remove this fetch if the timeline starts loading full IO upfront.
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
                  }}
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
