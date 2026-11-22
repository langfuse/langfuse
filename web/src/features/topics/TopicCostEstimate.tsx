import type { FilterState } from "@langfuse/shared";
import {
  TOPICS_COST_ESTIMATE_BAND,
  TOPICS_COST_ESTIMATE_PARTIAL_MIN_TRACES,
  TOPICS_COST_ESTIMATE_SAMPLE_SIZE,
  scaleTopicCostEstimate,
} from "@langfuse/shared/topics";
import { Button } from "@/src/components/design-system/Button/Button";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { centCostFormatter } from "@/src/utils/numbers";
import { api, type RouterOutputs } from "@/src/utils/api";

type Estimate = NonNullable<RouterOutputs["topics"]["costEstimate"]>;

type TopicCostEstimateProps = {
  projectId: string;
  filter: FilterState;
  facetIds: string[];
  samplingPercent: number;
  /** Traces the first backfill would summarize, after sampling and its limit. */
  backfillTraces: number | null;
  source: "setup" | "new_map";
};

/** Starts a background cost estimate and follows it until its result. */
export function TopicCostEstimate({
  projectId,
  filter,
  facetIds,
  samplingPercent,
  backfillTraces,
  source,
}: TopicCostEstimateProps) {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const input = { projectId, filter, facetIds };
  const estimate = api.topics.costEstimate.useQuery(input, {
    enabled: facetIds.length > 0,
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? 2000 : false,
  });
  const start = api.topics.startCostEstimate.useMutation({
    onSuccess: () => utils.topics.costEstimate.invalidate(input),
  });
  return (
    <TopicCostEstimateView
      estimate={estimate.data ?? null}
      samplingPercent={samplingPercent}
      backfillTraces={backfillTraces}
      starting={start.isPending}
      disabled={facetIds.length === 0}
      error={start.error?.message ?? null}
      onStart={() => {
        capture("topics:cost_estimate_started", { source });
        start.mutate(input);
      }}
    />
  );
}

function range(low: number, high: number) {
  const lowText = centCostFormatter(low);
  const highText = centCostFormatter(high);
  return lowText === highText ? `~${lowText}` : `${lowText}–${highText}`;
}

function TopicCostEstimateView({
  estimate,
  samplingPercent,
  backfillTraces,
  starting,
  disabled,
  error,
  onStart,
}: {
  estimate: Estimate | null;
  samplingPercent: number;
  backfillTraces: number | null;
  starting: boolean;
  disabled: boolean;
  error: string | null;
  onStart: () => void;
}) {
  const running = estimate?.status === "running";
  const done = estimate?.status === "done";
  const perTraceUsd = estimate?.prices.perTraceUsd ?? null;
  const showCost =
    perTraceUsd !== null &&
    estimate?.finishedTraces7d != null &&
    (done || estimate.processed >= TOPICS_COST_ESTIMATE_PARTIAL_MIN_TRACES);
  const scaled = showCost
    ? scaleTopicCostEstimate({
        perTraceUsd,
        finishedTraces7d: estimate.finishedTraces7d ?? 0,
        samplingPercent,
        backfillTraces: backfillTraces ?? 0,
      })
    : null;
  const unpriced =
    done && perTraceUsd === null && estimate.processed > 0
      ? [
          estimate.prices.summaryPriced ? null : estimate.inputs.summaryModel,
          estimate.prices.embeddingPriced
            ? null
            : estimate.inputs.embeddingModel,
        ].filter(Boolean)
      : [];

  return (
    <div className="flex flex-col gap-1.5 rounded-md border px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold">Estimated cost</span>
        {!running ? (
          <Button
            text={done ? "Estimate again" : "Estimate cost"}
            variant="outline"
            size="sm"
            loading={starting}
            disabled={disabled}
            onClick={onStart}
          />
        ) : null}
      </div>
      {!estimate ? (
        <span className="text-muted-foreground text-sm">
          Measures {TOPICS_COST_ESTIMATE_SAMPLE_SIZE} recent matching traces
          with your models&apos; prices. No model is called.
        </span>
      ) : null}
      {running ? (
        <span className="text-muted-foreground flex items-center gap-2 text-sm">
          <Spinner size="sm" />
          {estimate.sampled > 0
            ? `Estimating… ${estimate.processed} of ${estimate.sampled} traces`
            : "Estimating… picking traces"}
        </span>
      ) : null}
      {scaled ? (
        <div className="flex flex-col gap-0.5 text-sm">
          <span>
            {range(scaled.daily.low, scaled.daily.high)} per day for new traces
            {running ? " (so far)" : ""}
          </span>
          {backfillTraces ? (
            <span>
              {range(scaled.backfill.low, scaled.backfill.high)} for the first
              backfill of {backfillTraces.toLocaleString("en-US")} traces
            </span>
          ) : null}
        </div>
      ) : null}
      {done && estimate.sampled === 0 ? (
        <span className="text-muted-foreground text-sm">
          No finished traces match in the last 7 days, so there is nothing to
          measure yet.
        </span>
      ) : null}
      {unpriced.length > 0 ? (
        <span className="text-muted-foreground text-sm">
          No price is known for {unpriced.join(" and ")}. Add a model price in
          the project settings to see a cost.
        </span>
      ) : null}
      {done && estimate.sampled > 0 ? (
        <span className="text-muted-foreground text-xs">
          From {estimate.sampled} traces of the last 7 days
          {estimate.skipped.tooLarge + estimate.skipped.noContent > 0
            ? `, ${estimate.skipped.tooLarge + estimate.skipped.noContent} of them skipped as too large or empty`
            : ""}
          . Range ±{TOPICS_COST_ESTIMATE_BAND * 100}%; naming topics and retries
          add a little.
        </span>
      ) : null}
      {estimate?.status === "failed" ? (
        <span className="text-destructive text-sm">{estimate.error}</span>
      ) : null}
      {error ? <span className="text-destructive text-sm">{error}</span> : null}
    </div>
  );
}
