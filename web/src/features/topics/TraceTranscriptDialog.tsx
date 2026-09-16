import { type ReactNode } from "react";
import {
  DialogBody,
  DialogController,
  DialogDescription,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { api } from "@/src/utils/api";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

export function TraceTranscriptDialogController({
  projectId,
  traceId,
  children,
}: {
  projectId: string;
  traceId: string | null;
  children: (control: { openTranscript: (() => void) | null }) => ReactNode;
}) {
  const isMember = useIsAuthenticatedAndProjectMember(projectId);
  const canReadTopics = useHasProjectAccess({
    projectId,
    scope: "topics:read",
  });
  const canShowTranscript =
    process.env.NODE_ENV === "development" && isMember && canReadTopics;
  return (
    <DialogController<string>
      key={`${projectId}:${traceId}`}
      size="xxl"
      closeOnInteractionOutside
      renderContent={({ state }) => (
        <TraceTranscriptDialog projectId={projectId} traceId={state} />
      )}
    >
      {({ openDialog }) =>
        children({
          openTranscript:
            canShowTranscript && traceId ? () => openDialog(traceId) : null,
        })
      }
    </DialogController>
  );
}

function TraceTranscriptDialog({
  projectId,
  traceId,
}: {
  projectId: string;
  traceId: string;
}) {
  const transcript = api.topics.transcript.useQuery({ projectId, traceId });
  const summaries = api.topics.traceSummaries.useQuery({ projectId, traceId });

  return (
    <div className="ph-no-capture flex min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 space-y-1.5 border-b p-4 pr-10">
        <DialogTitle>Trace transcript</DialogTitle>
        <DialogDescription>
          One transcript, shared by every facet. Regenerated from the current
          trace; saved summaries below are specific to each facet version.
        </DialogDescription>
      </header>
      <DialogBody>
        <section aria-labelledby="trace-facet-summaries" className="space-y-3">
          <h3 id="trace-facet-summaries" className="text-sm font-bold">
            Saved facet summaries
          </h3>
          {summaries.isLoading && <p role="status">Loading summaries…</p>}
          {summaries.error && <p role="alert">{summaries.error.message}</p>}
          {summaries.data?.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No saved summaries for this trace.
            </p>
          )}
          {summaries.data?.map((summary) => (
            <details key={summary.id} open className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-bold">
                {summary.facetName} · v{summary.facetVersion}
              </summary>
              <div className="mt-2 space-y-2 text-sm">
                <p className="break-words whitespace-pre-wrap">
                  {summary.summary ||
                    (summary.state === "not_applicable"
                      ? "This facet does not apply to this trace."
                      : "Not enough evidence to summarize this facet.")}
                </p>
                <p className="text-muted-foreground text-xs">
                  Saved {new Date(summary.processedAt).toLocaleString()}
                </p>
                {summary.transcriptVersion === null ? (
                  <p className="text-muted-foreground text-xs">
                    Generated using the earlier facet-specific transcript.
                  </p>
                ) : transcript.data &&
                  summary.inputHash !== transcript.data.inputHash ? (
                  <p className="text-muted-foreground text-xs">
                    The trace or transcript format has changed since this
                    summary was generated.
                  </p>
                ) : null}
              </div>
            </details>
          ))}
        </section>
        {transcript.isLoading && <p role="status">Loading transcript…</p>}
        {transcript.error && <p role="alert">{transcript.error.message}</p>}
        {transcript.data && (
          <>
            <p className="text-muted-foreground text-xs">
              {transcript.data.coverage.observationCount} observations ·{" "}
              {transcript.data.coverage.truncatedBlockCount} shortened blocks.
              Media payloads and reasoning are omitted; each block is limited to
              4,000 characters.
            </p>
            <JSONView
              title="Transcript"
              json={transcript.data.text
                .split("\n")
                .filter(Boolean)
                .map((line): unknown => JSON.parse(line))}
              preserveStrings
              scrollable={false}
            />
          </>
        )}
      </DialogBody>
    </div>
  );
}
