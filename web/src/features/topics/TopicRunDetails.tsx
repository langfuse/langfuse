import { format } from "date-fns";
import { ChevronLeft } from "@langfuse/icons";
import { Banner } from "@/src/components/design-system/Banner/Banner";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { StatusBadge } from "@/src/components/ui/StatusBadge/StatusBadge";
import { cn } from "@/src/utils/tailwind";
import {
  orderByFacetIds,
  type TopicFacet,
  type TopicFacetOutcome,
} from "@langfuse/shared/topics";
import { TopicsErrorMessage } from "./TopicsErrorMessage";
import {
  busy,
  createsSummaries,
  executionBadgeTypes,
  executionLabels,
  formatTopicCost,
  formatTopicRunCost,
  runLabel,
  estimatedTopicCostDescription,
  estimatedTopicCostLabel,
  type TopicRunWithCost as Run,
} from "./topic-run-labels";

type FacetProgress = Run["facets"][number];

type TopicRunDetailsProps = {
  execution: Run;
  facets: Pick<TopicFacet, "id" | "name">[];
  canWrite: boolean;
  retry: {
    isPending: boolean;
    errorMessage?: string;
    onRetry: () => void;
  };
  onBack: () => void;
};

const phaseLabels: Record<string, string> = {
  queued: "Waiting for a worker",
  resuming: "Resuming",
  summarizing: "Summarizing traces",
  clustering: "Clustering summaries",
  naming: "Naming topics",
  assigning: "Assigning traces to topics",
  processing: "Processing questions",
};

const questionStatuses: Record<
  TopicFacetOutcome,
  { label: string; dot: string }
> = {
  published: { label: "Topics ready", dot: "bg-dark-green" },
  assigned: { label: "Topics ready", dot: "bg-dark-green" },
  pending: { label: "Waiting", dot: "bg-muted-foreground" },
  awaiting_topics: { label: "Waiting", dot: "bg-muted-foreground" },
  insufficient_data: { label: "Needs more traces", dot: "bg-dark-yellow" },
  no_topics: { label: "No topics found", dot: "bg-muted-foreground" },
  no_applicable_summaries: {
    label: "No topics found",
    dot: "bg-muted-foreground",
  },
  failed: { label: "Stopped", dot: "bg-destructive" },
};

function formatCount(count: number) {
  return count.toLocaleString("en-US");
}

function canResume(execution: Run) {
  if (execution.input.operation === "process") return false;
  return (
    execution.status === "failed" ||
    (execution.status === "completed_with_errors" &&
      execution.facets.some(
        (facet) => facet.outcome === "pending" || facet.outcome === "failed",
      ))
  );
}

/** Regenerate topics groups stored summaries, so its counts are summaries, not traces summarized by the run. */
function questionStats(progress: FacetProgress, execution: Run) {
  const c = progress.counts;
  const runStatus = execution.status;
  const isUpdate = execution.input.operation === "update";
  if (isUpdate && busy(runStatus) && progress.outcome === "pending")
    return c.requested > 0
      ? `Grouping ${formatCount(c.complete)} summaries into topics`
      : null;
  if (!isUpdate && runStatus === "failed")
    return `${formatCount(c.complete)} of ${formatCount(c.requested)} summarized · ${formatCount(Math.max(0, c.requested - c.complete))} left`;
  const summaryNoun = isUpdate ? "summaries" : "summarized";
  const parts = [
    c.assigned > 0
      ? `${formatCount(c.assigned)} in topics`
      : `${formatCount(c.complete)} ${summaryNoun}`,
  ];
  if (c.outlier > 0) parts.push(`${formatCount(c.outlier)} didn’t fit a topic`);
  if (c.insufficientInput > 0)
    parts.push(`${formatCount(c.insufficientInput)} had too little text`);
  if (c.nonApplicable > 0)
    parts.push(`${formatCount(c.nonApplicable)} had no issue`);
  if (c.failed > 0) parts.push(`${formatCount(c.failed)} failed`);
  return parts.join(" · ");
}

function questionNote(progress: FacetProgress, minimum: number | null) {
  const c = progress.counts;
  if (progress.outcome === "insufficient_data" && minimum !== null)
    return `Grouping needs at least ${formatCount(minimum)} summaries. Run on more traces, or lower the minimum.`;
  if (progress.outcome === "no_topics") {
    const unclustered = c.complete - c.nonApplicable;
    if (unclustered <= 0)
      return "No clear groups formed. Try a larger, more varied set of traces.";
    return c.nonApplicable > 0
      ? `The other ${formatCount(unclustered)} didn’t form clear groups. Try a larger, more varied set of traces.`
      : `${formatCount(unclustered)} summaries didn’t form clear groups. Try a larger, more varied set of traces.`;
  }
  if (progress.outcome === "awaiting_topics")
    return `${formatCount(c.complete)} summaries are ready. Create a new snapshot to group them.`;
  return null;
}

function StatusLabel({ label, dot }: { label: string; dot: string }) {
  return (
    <span className="flex shrink-0 items-center gap-2 text-sm whitespace-nowrap">
      <span className={cn("size-2 rounded-full", dot)} aria-hidden />
      {label}
    </span>
  );
}

function QuestionRow({
  progress,
  name,
  execution,
  minimum,
}: {
  progress: FacetProgress;
  name: string;
  execution: Run;
  minimum: number | null;
}) {
  const status = questionStatuses[progress.outcome] ?? {
    label: progress.outcome,
    dot: "bg-muted-foreground",
  };
  const note = questionNote(progress, minimum);
  const stats = questionStats(progress, execution);
  const facetError =
    progress.error && progress.error !== execution.error
      ? progress.error
      : null;
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <div className="flex items-center justify-between gap-2.5">
        <h4 className="truncate text-sm font-bold" title={name}>
          {name}
        </h4>
        <StatusLabel label={status.label} dot={status.dot} />
      </div>
      {stats && <p className="text-muted-foreground text-xs">{stats}</p>}
      {note && (
        <p className="text-foreground-secondary text-sm text-pretty">{note}</p>
      )}
      {facetError && (
        <p className="text-foreground-secondary text-sm break-words">
          {facetError}
        </p>
      )}
    </div>
  );
}

export function TopicRunDetails({
  execution,
  facets,
  canWrite,
  retry,
  onBack,
}: TopicRunDetailsProps) {
  const isUpdate = execution.input.operation === "update";
  // A summarizing snapshot counts traces, as a process run does.
  const summarizing = execution.phase === "summarizing";
  const perTrace = !isUpdate || summarizing;
  const counts = execution.facets.map((facet) => facet.counts);
  const total = perTrace
    ? Math.max(0, ...counts.map((c) => c.requested))
    : counts.reduce((sum, c) => sum + c.requested, 0);
  const complete = perTrace
    ? Math.min(total, ...counts.map((c) => c.complete))
    : counts.reduce((sum, c) => sum + c.complete, 0);
  const isBusy = busy(execution.status);
  const costs = execution.costBreakdown;
  const expectsSummaries = createsSummaries(execution.input);
  const summaryCost = expectsSummaries
    ? formatTopicCost(costs == null ? costs : costs.summaries)
    : "No new summaries";
  const namingCost = costs == null ? costs : costs.naming;
  const namingValue =
    !isUpdate && namingCost == null
      ? "Not part of this run"
      : formatTopicCost(namingCost);
  const failed = execution.status === "failed";
  const resumable = canWrite && !isBusy && canResume(execution);
  const exploratory =
    execution.input.operation === "update" && execution.input.exploratory;
  const defaultMinimum = exploratory ? 10 : 100;
  const minimum =
    execution.input.operation === "update"
      ? (execution.input.minimumTraceCount ?? defaultMinimum)
      : null;
  const name = runLabel(execution.input);
  const meta = [
    format(new Date(execution.createdAt), "MMM d, HH:mm"),
    isUpdate
      ? `${formatCount(total)} summaries`
      : `${formatCount(total)} traces`,
    ...(exploratory ? ["small sample"] : []),
  ].join(" · ");
  const showBar = perTrace && total > 0 && (isBusy || failed);
  const summaryLabel = (() => {
    if (isBusy)
      return (
        phaseLabels[execution.phase] ?? execution.phase.replaceAll("_", " ")
      );
    if (failed) return isUpdate ? "Summaries" : "Summarized before it stopped";
    return isUpdate ? "Summaries" : "Summarized";
  })();
  const summaryValue = (() => {
    if (!perTrace) return formatCount(total);
    return total > 0
      ? `${formatCount(complete)} / ${formatCount(total)}`
      : null;
  })();

  return (
    <section className="flex w-full min-w-0 flex-col">
      <header className="flex items-center justify-between gap-2.5 border-b py-3.5 pr-12 pl-3">
        <div className="flex min-w-0 items-center gap-2">
          <IconButton
            icon={ChevronLeft}
            label="All runs"
            variant="ghost"
            size="sm"
            onClick={onBack}
          />
          <div className="flex min-w-0 flex-col">
            <h2 className="truncate text-base font-bold" title={name}>
              {name}
            </h2>
            <span className="text-muted-foreground font-mono text-xs">
              {meta}
            </span>
          </div>
        </div>
        <StatusBadge
          type={executionBadgeTypes[execution.status]}
          showText={false}
        >
          {executionLabels[execution.status]}
        </StatusBadge>
      </header>
      {(failed || resumable) && (
        <div className="px-4 pt-4">
          <Banner
            variant="error"
            title="Run stopped"
            actions={
              resumable
                ? [
                    {
                      text: "Resume run",
                      disabled: retry.isPending,
                      onClick: () => retry.onRetry(),
                    },
                  ]
                : undefined
            }
          >
            <div className="flex flex-col gap-0.5">
              {execution.error && (
                <p className="break-words">{execution.error}</p>
              )}
              {!isUpdate && complete > 0 && (
                <p>
                  {formatCount(complete)} traces are already summarized and will
                  be kept.
                </p>
              )}
            </div>
          </Banner>
        </div>
      )}
      {retry.errorMessage && (
        <div className="px-4 pt-4">
          <TopicsErrorMessage message={retry.errorMessage} />
        </div>
      )}
      <div
        className="flex flex-col gap-2.5 border-b p-4"
        role={isBusy ? "status" : undefined}
      >
        {showBar && (
          <div className="bg-muted h-1.5 overflow-hidden rounded-sm">
            <div
              className={cn(
                "h-full rounded-sm",
                failed ? "bg-destructive" : "bg-foreground",
              )}
              style={{ width: `${(complete / total) * 100}%` }}
            />
          </div>
        )}
        <div className="flex items-center justify-between gap-2.5">
          <span className="text-muted-foreground text-xs">{summaryLabel}</span>
          {summaryValue && (
            <span className="font-mono text-xs">{summaryValue}</span>
          )}
        </div>
        <dl className="grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-1 text-xs">
          <dt className="font-medium">{estimatedTopicCostLabel}</dt>
          <dd className="text-right font-mono font-medium">
            {formatTopicRunCost(costs)}
          </dd>
          <dt className="text-muted-foreground">Summaries and embeddings</dt>
          <dd className="text-right font-mono">{summaryCost}</dd>
          <dt className="text-muted-foreground">Topic naming</dt>
          <dd className="text-right font-mono">{namingValue}</dd>
        </dl>
        <p className="text-muted-foreground text-xs">
          {estimatedTopicCostDescription}
        </p>
      </div>
      <div className="flex flex-col">
        <h3 className="text-muted-foreground px-4 pt-3.5 pb-0.5 text-xs font-bold">
          Questions
        </h3>
        <div className="divide-y">
          {orderByFacetIds(execution.facets, facets).map((progress) => (
            <QuestionRow
              key={`${progress.facetId}:${progress.facetVersion}`}
              progress={progress}
              name={
                facets.find((item) => item.id === progress.facetId)?.name ??
                "Question"
              }
              execution={execution}
              minimum={minimum}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
