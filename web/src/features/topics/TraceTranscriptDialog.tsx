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
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";

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
  const topicsEnabled = useIsFeatureEnabled("langfuseTopics", { projectId });
  const canReadTopics = useHasProjectAccess({
    projectId,
    scope: "topics:read",
  });
  const canShowTranscript =
    process.env.NODE_ENV === "development" &&
    topicsEnabled &&
    isMember &&
    canReadTopics;
  if (!canShowTranscript || !traceId) {
    return children({ openTranscript: null });
  }
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
          openTranscript: () => openDialog(traceId),
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
      <header className="flex shrink-0 flex-col gap-1 border-b p-3 pr-10">
        <DialogTitle>Trace transcript</DialogTitle>
        <DialogDescription>
          Current transcript and saved summaries by facet version.
        </DialogDescription>
      </header>
      <DialogBody>
        <section
          aria-labelledby="trace-facet-summaries"
          className="flex flex-col gap-2"
        >
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
            <article
              key={summary.id}
              className="flex flex-col gap-1 rounded-md border p-2 text-sm"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h4 className="font-bold">
                  {summary.facetName} · v{summary.facetVersion}
                </h4>
                <p className="text-muted-foreground text-xs">
                  Saved {new Date(summary.processedAt).toLocaleString()}
                </p>
              </div>
              <p className="break-words whitespace-pre-wrap">
                {summary.summary ||
                  (summary.state === "not_applicable"
                    ? "This facet does not apply to this trace."
                    : "Not enough evidence to summarize this facet.")}
              </p>
              {transcript.data &&
                summary.inputHash !== transcript.data.inputHash && (
                  <p className="text-muted-foreground text-xs">
                    Trace content has changed since this summary was saved.
                  </p>
                )}
            </article>
          ))}
        </section>
        {transcript.isLoading && <p role="status">Loading transcript…</p>}
        {transcript.error && <p role="alert">{transcript.error.message}</p>}
        {transcript.data && (
          <>
            <p className="text-muted-foreground text-xs">
              {transcript.data.coverage.observationCount} observations ·{" "}
              {transcript.data.coverage.truncatedBlockCount} shortened blocks.
              Media payloads and reasoning are omitted. The transcript is
              limited to 10,000 characters.
            </p>
            <JSONView
              title="Transcript"
              json={JSON.parse(transcript.data.text)}
              preserveStrings
              scrollable={false}
            />
          </>
        )}
      </DialogBody>
    </div>
  );
}
