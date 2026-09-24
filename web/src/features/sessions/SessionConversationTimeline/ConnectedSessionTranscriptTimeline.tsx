import { type SessionConversationTimelineController } from "./SessionConversationTimeline";
import { SessionConversationTimelineFeed } from "./SessionConversationTimelineFeed";
import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";
import { AnnotateDrawerController } from "@/src/features/scores";
import { CommentDrawerController } from "@/src/features/comments";
import { NewDatasetItemFromExistingObjectDialogController } from "@/src/features/datasets";
import { InternalFeatureBadge } from "@/src/features/feature-flags";

type TranscriptTraceItem = {
  trace: EventSessionTrace;
  turnNumber: number;
};

export function ConnectedSessionTranscriptTimeline({
  traces,
  projectId,
  controller,
}: {
  traces: readonly TranscriptTraceItem[];
  projectId: string;
  controller: SessionConversationTimelineController;
}) {
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
                  traces={traces}
                  TraceComponent={SessionTranscriptTracePlaceholder}
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

function SessionTranscriptTracePlaceholder({
  trace,
  turnNumber,
}: TranscriptTraceItem) {
  return (
    <section data-session-trace-id={trace.id} className="space-y-2 p-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold">
          {turnNumber}. {trace.name ?? "Trace"}
        </span>
        <InternalFeatureBadge />
      </div>
      <p className="text-muted-foreground text-sm">
        Transcript fetching and rendering are not connected yet.
      </p>
    </section>
  );
}
