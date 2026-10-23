import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { Button } from "@/src/components/design-system/Button/Button";
import { Button as PopoverButton } from "@/src/components/ui/button";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { PopoverController } from "@/src/components/ui/popover";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { type RouterOutputs } from "@/src/utils/api";
import {
  type TopicFacet,
  type TopicFacetOutcome,
} from "@langfuse/shared/topics";
import { TopicsErrorMessage } from "./TopicsErrorMessage";
import {
  busy,
  estimatedExecutionCost,
  executionLabels,
  operationLabels,
} from "./topic-run-labels";

const executionPhaseLabels: Record<string, string> = {
  queued: "Waiting for a worker",
  summarizing: "Preparing summaries and embeddings",
  clustering: "Clustering summaries",
  naming: "Naming topics",
  assigning: "Assigning traces to topics",
  processing: "Processing facets",
};
const facetOutcomeLabels: Record<TopicFacetOutcome, string> = {
  pending: "Waiting for results",
  published: "Topics ready",
  assigned: "Traces assigned",
  awaiting_topics: "Awaiting topics",
  insufficient_data: "More traces needed",
  no_applicable_summaries: "No applicable traces",
  no_topics: "No topics found",
  failed: "Facet failed",
};

export function TopicRunDetails({
  execution,
  facets,
  projectId,
  canWrite,
  traceErrors,
  retry,
  onRefresh,
}: TopicRunDetailsProps) {
  const isUpdate = execution.input.operation === "update";
  const selectionDescription = isUpdate
    ? `${execution.facets.reduce((count, facet) => count + facet.counts.requested, 0).toLocaleString()} stored facet summaries`
    : `${Math.max(0, ...execution.facets.map((facet) => facet.counts.requested)).toLocaleString()} selected traces`;
  const facetCount = execution.facets.length;
  const operationLabel = operationLabels[execution.input.operation];
  const modeLabel = (() => {
    if (execution.input.operation !== "update")
      return "Assign to current topics";
    return execution.input.exploratory ? "Small sample" : "Standard";
  })();
  const selectionPrefix = (() => {
    if (execution.status === "running") return "Running on ";
    if (execution.status === "queued") return "Queued for ";
    return "Run selection: ";
  })();
  return (
    <section className="flex w-full min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Badge text={executionLabels[execution.status]} />
          {execution.input.operation === "update" &&
            execution.input.exploratory && (
              <Badge text="Small sample · provisional" />
            )}
        </div>
        <PopoverController
          align="end"
          contentClassName="w-80 max-w-[calc(100vw-2rem)]"
          disabled={false}
          modal={false}
          renderContent={() => (
            <div className="ph-no-capture flex flex-col gap-3 text-sm">
              <h3 className="font-bold">Run details</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <dt className="text-muted-foreground">Triggered</dt>
                <dd>{new Date(execution.createdAt).toLocaleString()}</dd>
                <dt className="text-muted-foreground">Operation</dt>
                <dd>{operationLabel}</dd>
                <dt className="text-muted-foreground">Mode</dt>
                <dd>{modeLabel}</dd>
                <dt className="text-muted-foreground">Last step</dt>
                <dd className="capitalize">
                  {execution.phase.replaceAll("_", " ")}
                </dd>
                <dt className="text-muted-foreground">Embedding dimensions</dt>
                <dd>{execution.input.embeddingConfig.embeddingDimensions}</dd>
                {execution.input.operation === "update" && (
                  <>
                    <dt className="text-muted-foreground">
                      Minimum traces for clustering
                    </dt>
                    <dd>
                      {execution.input.minimumTraceCount ??
                        (execution.input.exploratory ? 10 : 100)}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          )}
        >
          {({ Trigger }) => (
            <Trigger asChild>
              <PopoverButton variant="ghost" size="sm">
                Run details
              </PopoverButton>
            </Trigger>
          )}
        </PopoverController>
      </div>
      <div
        className="flex flex-col gap-1"
        role={busy(execution.status) ? "status" : undefined}
      >
        <p className="text-sm">
          {operationLabel} · {selectionPrefix}
          {selectionDescription} across {facetCount.toLocaleString()}{" "}
          {facetCount === 1 ? "facet" : "facets"}.
        </p>
        {busy(execution.status) && (
          <p className="text-muted-foreground text-sm">
            {executionPhaseLabels[execution.phase] ??
              execution.phase.replaceAll("_", " ")}
            . Counts update after each processing batch. You can leave this page
            and reopen the run.
          </p>
        )}
      </div>
      {!isUpdate && (
        <section className="flex flex-col gap-2 rounded-md border p-3 text-sm">
          <p className="flex items-center justify-between gap-3">
            <span className="font-bold">Estimated cost</span>
            <span className="tabular-nums">
              {estimatedExecutionCost(execution.estimatedCost)}
            </span>
          </p>
          <p className="text-muted-foreground text-xs">
            Estimated cost for this run’s currently stored summaries and
            embeddings. Costs may decrease when summaries are reused,
            reprocessed, or deleted.
          </p>
        </section>
      )}
      {execution.error && <TopicsErrorMessage message={execution.error} />}
      {execution.facets.some((facet) => facet.counts.failed > 0) && (
        <details
          className="ph-no-capture text-sm"
          open={traceErrors.open}
          onToggle={(event) =>
            traceErrors.onOpenChange(event.currentTarget.open)
          }
        >
          <summary className="cursor-pointer">Trace errors</summary>
          {traceErrors.open && (
            <div className="flex flex-col gap-2 pt-2">
              {traceErrors.isPending && <p>Loading trace errors…</p>}
              {traceErrors.errorMessage && (
                <TopicsErrorMessage message={traceErrors.errorMessage} />
              )}
              {traceErrors.data?.expired && (
                <p>
                  Trace error details have expired. The run counts are still
                  available.
                </p>
              )}
              {traceErrors.data?.errors.map((item) => (
                <p
                  key={`${item.traceId}:${item.error}`}
                  className="break-words"
                >
                  <TextLink
                    path={`/project/${projectId}/traces/${encodeURIComponent(item.traceId)}`}
                    value={item.traceId}
                  />
                  : {item.error}
                </p>
              ))}
              {traceErrors.data &&
                !traceErrors.data.expired &&
                traceErrors.data.errors.length === 0 && (
                  <p>No trace-level errors were recorded.</p>
                )}
            </div>
          )}
        </details>
      )}
      {canWrite &&
        !busy(execution.status) &&
        (execution.status === "failed" ||
          (execution.status === "completed_with_errors" &&
            execution.facets.some(
              (facet) =>
                facet.outcome === "pending" || facet.outcome === "failed",
            ))) && (
          <div className="self-start">
            <Button
              text="Resume interrupted stages"
              disabled={retry.isPending}
              onClick={() => retry.onRetry()}
            />
          </div>
        )}
      {retry.errorMessage && (
        <TopicsErrorMessage message={retry.errorMessage} />
      )}
      {execution.facets.map((progress) => {
        const facet = facets.find((item) => item.id === progress.facetId);
        return (
          <div
            key={`${progress.facetId}:${progress.facetVersion}`}
            className="flex flex-col gap-3 border-t pt-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold">{facet?.name ?? "Facet"}</h3>
              <Badge text={facetOutcomeLabels[progress.outcome]} />
            </div>
            <p className="text-muted-foreground text-sm">
              {[
                `${progress.counts.complete.toLocaleString()} / ${progress.counts.requested.toLocaleString()} traces have summaries and embeddings ready`,
                ...(progress.runId
                  ? [
                      `${progress.counts.assigned.toLocaleString()} assigned`,
                      `${progress.counts.outlier.toLocaleString()} outliers`,
                    ]
                  : []),
                ...(progress.counts.nonApplicable
                  ? [
                      `${progress.counts.nonApplicable.toLocaleString()} not applicable`,
                    ]
                  : []),
                ...(progress.counts.insufficientInput
                  ? [
                      `${progress.counts.insufficientInput.toLocaleString()} insufficient input`,
                    ]
                  : []),
                `${progress.counts.failed.toLocaleString()} failed`,
              ].join(" · ")}
            </p>
            {progress.outcome === "awaiting_topics" && (
              <p className="text-sm">
                {progress.counts.complete.toLocaleString()} summaries are ready.
                Run Update topics to create topics for this facet and embedding
                configuration.
              </p>
            )}
            {progress.error &&
              (progress.outcome === "published" ? (
                <Alert variant="warning">
                  <Alert.Description>{progress.error}</Alert.Description>
                </Alert>
              ) : (
                <TopicsErrorMessage message={progress.error} />
              ))}
            {progress.outcome === "insufficient_data" &&
              execution.input.operation === "update" && (
                <p className="text-sm">
                  Clustering needs at least{" "}
                  {execution.input.minimumTraceCount ??
                    (execution.input.exploratory ? 10 : 100)}{" "}
                  compatible stored summaries for this facet. Process more
                  traces or lower the minimum when starting a new update.
                </p>
              )}
            {progress.outcome === "no_topics" && (
              <p className="text-sm">
                No stable groups found. Inspect the summaries, adjust the facet,
                or try a larger and more varied batch.
              </p>
            )}
          </div>
        );
      })}
      {!busy(execution.status) && (
        <div className="self-start">
          <Button
            text="Refresh status"
            variant="ghost"
            onClick={() => onRefresh()}
          />
        </div>
      )}
    </section>
  );
}

type TopicRunDetailsProps = {
  execution: RouterOutputs["topics"]["execution"];
  facets: Pick<TopicFacet, "id" | "name">[];
  projectId: string;
  canWrite: boolean;
  traceErrors: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    isPending: boolean;
    errorMessage?: string;
    data?: RouterOutputs["topics"]["traceErrors"];
  };
  retry: {
    isPending: boolean;
    errorMessage?: string;
    onRetry: () => void;
  };
  onRefresh: () => void;
};
