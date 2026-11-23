import {
  TOPICS_COST_ESTIMATE_SAMPLE_SIZE,
  TOPICS_COST_ESTIMATE_MAX_FACETS,
  type TopicCostEstimate,
  type TopicCostEstimatePrices,
} from "@langfuse/shared/topics";
import { Button } from "@/src/components/design-system/Button/Button";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { usdFormatter } from "@/src/utils/numbers";

type Estimate = TopicCostEstimate & { prices: TopicCostEstimatePrices };

export type TopicEstimateVolume =
  | {
      /** Sampling scales daily volume without measuring the traces again. */
      samplingPercent: number;
      dailyTraces: number | null;
      backfillTraces: number | null;
      newTraces?: never;
    }
  | {
      /** Only the traces selected for new summaries in this snapshot. */
      newTraces: number;
      samplingPercent?: never;
      dailyTraces?: never;
      backfillTraces?: never;
    };

// Two significant digits below a cent, so a per-trace cost never reads as $0.00.
const approxUsd = (usd: number) =>
  `~${
    usd >= 0.01
      ? usdFormatter(usd, 2, 2)
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumSignificantDigits: 2,
        }).format(usd)
  }`;

const approxCount = (count: number) =>
  `~${new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Math.round(count))}`;

export type TopicEstimateControls = {
  estimate: Estimate | null;
  facetCount: number;
  starting: boolean;
  error: string | null;
  onStart: () => void;
};

/** The cost estimate card: start button, cost per trace and what it adds up to. */
export function TopicCostEstimateView({
  estimate,
  samplingPercent,
  dailyTraces,
  backfillTraces,
  newTraces,
  onAddModelPrice,
  starting,
  facetCount,
  error,
  onStart,
}: TopicEstimateVolume &
  TopicEstimateControls & { onAddModelPrice?: () => void }) {
  if (facetCount > TOPICS_COST_ESTIMATE_MAX_FACETS)
    return (
      <p className="text-muted-foreground text-sm">
        Cost estimates support up to {TOPICS_COST_ESTIMATE_MAX_FACETS} selected
        questions.
      </p>
    );
  const running = estimate?.status === "running";
  const done = estimate?.status === "done";
  const measured = done && estimate.sampled > 0;
  const perTraceUsd = measured ? estimate.prices.perTraceUsd : null;
  const sampledDailyTraces =
    dailyTraces != null ? dailyTraces * (samplingPercent / 100) : null;
  const unpriced: string[] = [];
  if (measured && perTraceUsd === null) {
    if (!estimate.prices.summaryPriced && estimate.inputs.summaryModel)
      unpriced.push(estimate.inputs.summaryModel);
    if (!estimate.prices.embeddingPriced && estimate.inputs.embeddingModel)
      unpriced.push(estimate.inputs.embeddingModel);
  }
  const tokensPerTrace =
    measured && unpriced.length > 0
      ? {
          input: estimate.tokens.inputTokens / estimate.sampled,
          output: estimate.tokens.outputTokens / estimate.sampled,
        }
      : null;

  const addPriceHint = onAddModelPrice
    ? ""
    : " You don't have permission to add one.";

  return (
    <div className="flex flex-col gap-2 rounded-md border px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">
          {newTraces === undefined
            ? "Cost estimate"
            : "Summary and embedding cost"}
        </span>
        {running ? (
          <span className="text-muted-foreground flex items-center gap-2 text-xs">
            <Spinner size="sm" />
            Measuring recent traces
          </span>
        ) : (
          <Button
            text="Estimate cost"
            variant="outline"
            size="sm"
            loading={starting}
            // The same inputs give the same estimate, so a measured one is not run again.
            disabled={facetCount === 0 || measured}
            onClick={onStart}
          />
        )}
      </div>

      {!estimate ? (
        <span className="text-muted-foreground text-sm">
          Measures {TOPICS_COST_ESTIMATE_SAMPLE_SIZE} recent matching traces
          against your models&apos; prices. No model is called.
        </span>
      ) : null}

      {perTraceUsd !== null && newTraces !== undefined && (
        <div className="text-sm">
          <span className="text-lg font-medium tabular-nums">
            {approxUsd(perTraceUsd * newTraces)}
          </span>{" "}
          for up to {newTraces.toLocaleString("en-US")} new{" "}
          {newTraces === 1 ? "trace" : "traces"}
        </div>
      )}

      {perTraceUsd !== null && newTraces === undefined && (
        <>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span>
              <span className="text-lg font-medium tabular-nums">
                {approxUsd(perTraceUsd)}
              </span>{" "}
              <span className="text-muted-foreground text-sm">per trace</span>
            </span>
            <span>
              <span className="text-lg font-medium tabular-nums">
                {approxUsd(perTraceUsd * 1000)}
              </span>{" "}
              <span className="text-muted-foreground text-sm">
                per 1k traces
              </span>
            </span>
          </div>
          {sampledDailyTraces !== null && (
            <span className="text-sm">
              {approxUsd(perTraceUsd * sampledDailyTraces)} per day at{" "}
              {samplingPercent}% sampling
              <span className="text-muted-foreground">
                {" "}
                · {approxCount(sampledDailyTraces)} traces a day
                {backfillTraces
                  ? ` · ${approxUsd(perTraceUsd * backfillTraces)} for the first backfill of ${backfillTraces.toLocaleString("en-US")} traces`
                  : ""}
              </span>
            </span>
          )}
        </>
      )}

      {tokensPerTrace ? (
        <div className="flex flex-col gap-1 text-sm">
          <span>
            {approxCount(tokensPerTrace.input)} input and{" "}
            {approxCount(tokensPerTrace.output)} output tokens per trace
          </span>
          <span className="text-muted-foreground">
            No price is set for {unpriced.join(" and ")}.{addPriceHint}
          </span>
          <span>
            <Button
              text="Add model price"
              variant="outline"
              size="sm"
              disabled={!onAddModelPrice}
              onClick={onAddModelPrice}
            />
          </span>
        </div>
      ) : null}

      {done && estimate.sampled === 0 ? (
        <span className="text-muted-foreground text-sm">
          No finished traces match in the last 7 days, so there is nothing to
          measure yet.
        </span>
      ) : null}

      {done && estimate.sampled > 0 && (
        <span className="text-muted-foreground text-xs">
          {newTraces === undefined
            ? `Estimated from ${estimate.sampled} recent traces. Actual cost depends on your provider.`
            : `Based on ${estimate.sampled} matching traces from the last 7 days.`}
        </span>
      )}

      {newTraces !== undefined ? (
        <span className="text-muted-foreground text-xs">
          Topic naming may incur an additional charge.
        </span>
      ) : null}

      {estimate?.status === "failed" ? (
        <span className="text-destructive text-sm">{estimate.error}</span>
      ) : null}
      {error ? <span className="text-destructive text-sm">{error}</span> : null}
    </div>
  );
}
