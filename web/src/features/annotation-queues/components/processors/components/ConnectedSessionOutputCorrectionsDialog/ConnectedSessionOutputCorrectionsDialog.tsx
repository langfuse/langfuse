/* eslint-disable boundaries/dependencies -- TODO: component privacy */
import {
  filterAndValidateDbScoreList,
  parseJsonIfString,
} from "@langfuse/shared";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { JsonSkeleton } from "@/src/components/ui/CodeJsonViewer";
import { getMostRecentCorrection } from "@/src/features/corrections/utils/getMostRecentCorrection";
import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";
import { getVisibleSessionObservations } from "@/src/features/sessions/sessionVisibleObservations";
import { IOPreview } from "@/src/features/traces/components/IOPreview/IOPreview";
import { CorrectedOutputField } from "@/src/features/traces/components/IOPreview/components/CorrectedOutputField";
import { api, shouldRetryResourceQuery } from "@/src/utils/api";

export function ConnectedSessionOutputCorrectionsDialog({
  projectId,
  sessionId,
  trace,
  isOpen,
}: {
  projectId: string;
  sessionId: string;
  trace: EventSessionTrace;
  isOpen: boolean;
}) {
  const observations = api.sessions.observationsForTraceFromEvents.useQuery(
    { projectId, sessionId, traceId: trace.id, filter: [] },
    { enabled: isOpen, retry: shouldRetryResourceQuery },
  );
  const correctionsQuery = api.events.scoresForTrace.useQuery(
    { projectId, traceId: trace.id, timestamp: trace.timestamp },
    { enabled: isOpen, retry: shouldRetryResourceQuery },
  );
  const corrections = filterAndValidateDbScoreList({
    scores: correctionsQuery.data ?? [],
    dataTypes: ["CORRECTION"],
    onParseError: (error) =>
      console.error("Failed to parse output correction", error),
  });
  const { visibleObservations, hasMoreObservations } =
    getVisibleSessionObservations(observations.data, trace.id);

  return (
    <Dialog title="Output corrections" size="lg" noCapture>
      <Dialog.Body>
        <p className="text-muted-foreground">
          {trace.name ?? "Trace"}
          <br />
          Corrections apply to a trace’s or observation’s entire output, not
          individual conversation messages. Changes are saved automatically.
        </p>
        {(() => {
          if (observations.isError || correctionsQuery.isError) {
            return (
              <p role="alert" className="text-destructive">
                Failed to load output corrections.
              </p>
            );
          }
          if (observations.isPending || correctionsQuery.isPending) {
            return <JsonSkeleton numRows={6} />;
          }
          return (
            <>
              {visibleObservations?.length === 0 && (
                <p>
                  No outputs available to correct here.{" "}
                  <a
                    className="underline"
                    href={`/project/${projectId}/traces/${trace.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open trace
                  </a>{" "}
                  to inspect its output and correction options.
                </p>
              )}
              {visibleObservations?.map((observation) => {
                const isTraceOutput = observation.id === `t-${trace.id}`;
                const observationId = isTraceOutput
                  ? undefined
                  : observation.id;
                return (
                  <section
                    key={observation.id}
                    className="flex flex-col gap-3 rounded-md border p-4"
                    aria-label={`Output correction for ${observation.name ?? observation.id}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-bold">
                        {observation.name ?? "Observation"}
                      </h3>
                      <a
                        className="text-muted-foreground text-xs underline"
                        href={
                          isTraceOutput
                            ? `/project/${projectId}/traces/${trace.id}`
                            : `/project/${projectId}/traces/${trace.id}?observation=${encodeURIComponent(observation.id)}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {isTraceOutput ? "Open trace" : "Open observation"}
                      </a>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {observation.id} ·{" "}
                      {observation.startTime.toLocaleString()}
                    </p>
                    {observation.outputTruncated && (
                      <p className="text-muted-foreground text-xs">
                        Original output preview only. Open the observation for
                        its full output; the correction editor starts empty
                        rather than copying a truncated output.
                      </p>
                    )}
                    <IOPreview
                      output={observation.output ?? undefined}
                      hideInput
                      currentView="json"
                      projectId={projectId}
                      traceId={trace.id}
                      observationId={observationId}
                      environment={trace.environment ?? "default"}
                      showCorrections={false}
                    />
                    <CorrectedOutputField
                      projectId={projectId}
                      traceId={trace.id}
                      observationId={observationId}
                      environment={trace.environment ?? "default"}
                      actualOutput={
                        observation.outputTruncated
                          ? undefined
                          : parseJsonIfString(observation.output)
                      }
                      actualOutputTooLarge={observation.outputTruncated}
                      existingCorrection={getMostRecentCorrection(
                        corrections.filter((correction) =>
                          isTraceOutput
                            ? correction.observationId == null
                            : correction.observationId === observationId,
                        ) ?? [],
                      )}
                    />
                  </section>
                );
              })}
              {hasMoreObservations && (
                <p className="text-muted-foreground text-xs">
                  Showing the first 50 observations.{" "}
                  <a
                    className="underline"
                    href={`/project/${projectId}/traces/${trace.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open trace
                  </a>{" "}
                  for the remaining observations.
                </p>
              )}
            </>
          );
        })()}
      </Dialog.Body>
    </Dialog>
  );
}
