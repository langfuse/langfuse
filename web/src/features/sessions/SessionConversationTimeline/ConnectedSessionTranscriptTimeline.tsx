import { type SessionConversationTimelineController } from "./SessionConversationTimeline";
import { SessionConversationTimelineFeed } from "./SessionConversationTimelineFeed";
import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";
import { AnnotateDrawerController } from "@/src/features/scores";
import { CommentDrawerController } from "@/src/features/comments";
import { NewDatasetItemFromExistingObjectDialogController } from "@/src/features/datasets";
import { SessionTranscriptTrace } from "./SessionTranscriptTrace";
import { useSessionTraceTranscripts } from "./useSessionTraceTranscripts";

type TranscriptTraceItem = {
  trace: EventSessionTrace;
  turnNumber: number;
};

export function ConnectedSessionTranscriptTimeline({
  traces,
  projectId,
  activeTraceIds,
  controller,
}: {
  traces: readonly TranscriptTraceItem[];
  projectId: string;
  activeTraceIds: ReadonlySet<string>;
  controller: SessionConversationTimelineController;
}) {
  const resultsByTraceId = useSessionTraceTranscripts({
    projectId,
    traces,
    activeTraceIds,
  });

  // TODO: Share the action controllers with the observation connector when
  // transcript actions are wired, rather than maintaining duplicate workflows.
  return (
    <AnnotateDrawerController projectId={projectId}>
      {() => (
        <CommentDrawerController projectId={projectId} mode="read-only">
          {() => (
            <NewDatasetItemFromExistingObjectDialogController
              projectId={projectId}
            >
              {() => (
                <SessionConversationTimelineFeed
                  traces={traces.map(({ trace, turnNumber }) => ({
                    trace,
                    turnNumber,
                    result: resultsByTraceId.get(trace.id) ?? {
                      state: "loading" as const,
                    },
                  }))}
                  TraceComponent={SessionTranscriptTrace}
                  filterMeasurementKey="transcript"
                  controller={controller}
                />
              )}
            </NewDatasetItemFromExistingObjectDialogController>
          )}
        </CommentDrawerController>
      )}
    </AnnotateDrawerController>
  );
}
