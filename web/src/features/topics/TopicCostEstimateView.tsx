import Link from "next/link";
import {
  TOPICS_COST_ESTIMATE_PARTIAL_MIN_TRACES,
  TOPICS_COST_ESTIMATE_SAMPLE_SIZE,
  type TopicCostEstimate,
  type TopicCostEstimatePrices,
} from "@langfuse/shared/topics";
import { Button } from "@/src/components/design-system/Button/Button";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { usdFormatter } from "@/src/utils/numbers";

type Estimate = TopicCostEstimate & { prices: TopicCostEstimatePrices };

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

/** The cost estimate card: start button, progress, cost per trace and what it adds up to. */
export function TopicCostEstimateView({
  estimate,
  samplingPercent,
  backfillTraces,
  modelSettingsHref,
  starting,
  disabled,
  error,
  onStart,
}: {
  estimate: Estimate | null;
  /** Applied on read, so changing it never needs a new estimate. */
  samplingPercent: number;
  backfillTraces: number | null;
  modelSettingsHref: string;
  starting: boolean;
  disabled: boolean;
  error: string | null;
  onStart: () => void;
}) {
  const running = estimate?.status === "running";
  const done = estimate?.status === "done";
  const measured =
    estimate !== null &&
    estimate.processed > 0 &&
    (done || estimate.processed >= TOPICS_COST_ESTIMATE_PARTIAL_MIN_TRACES);
  const perTraceUsd = measured ? estimate.prices.perTraceUsd : null;
  const dailyTraces =
    measured && estimate.finishedTraces7d !== null
      ? (estimate.finishedTraces7d / 7) * (samplingPercent / 100)
      : null;
  const unpriced =
    measured && perTraceUsd === null
      ? [
          estimate.prices.summaryPriced ? null : estimate.inputs.summaryModel,
          estimate.prices.embeddingPriced
            ? null
            : estimate.inputs.embeddingModel,
        ].filter((model): model is string => Boolean(model))
      : [];
  const tokensPerTrace =
    measured && unpriced.length > 0
      ? {
          input:
            (estimate.tokens.prefixTokens + estimate.tokens.inputTokens) /
            estimate.processed,
          output: estimate.tokens.outputTokens / estimate.processed,
        }
      : null;

  return (
    <div className="flex flex-col gap-2 rounded-md border px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">Cost estimate</span>
        {running ? (
          <span className="text-muted-foreground flex items-center gap-2 text-xs">
            <Spinner size="sm" />
            {estimate.sampled > 0
              ? `Measuring ${estimate.processed} of ${estimate.sampled} traces`
              : "Picking traces"}
          </span>
        ) : (
          <Button
            text={done ? "Estimate again" : "Estimate cost"}
            variant="outline"
            size="sm"
            loading={starting}
            disabled={disabled}
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

      {perTraceUsd !== null ? (
        <>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span>
              <span className="text-lg font-semibold tabular-nums">
                {approxUsd(perTraceUsd)}
              </span>{" "}
              <span className="text-muted-foreground text-sm">per trace</span>
            </span>
            <span>
              <span className="text-lg font-semibold tabular-nums">
                {approxUsd(perTraceUsd * 1000)}
              </span>{" "}
              <span className="text-muted-foreground text-sm">
                per 1k traces
              </span>
            </span>
          </div>
          {dailyTraces !== null ? (
            <span className="text-sm">
              {approxUsd(perTraceUsd * dailyTraces)} per day at{" "}
              {samplingPercent}% sampling
              <span className="text-muted-foreground">
                {" "}
                · {approxCount(dailyTraces)} traces a day
                {backfillTraces
                  ? ` · ${approxUsd(perTraceUsd * backfillTraces)} for the first backfill of ${backfillTraces.toLocaleString("en-US")} traces`
                  : ""}
              </span>
            </span>
          ) : null}
        </>
      ) : null}

      {tokensPerTrace ? (
        <div className="flex flex-col gap-1 text-sm">
          <span>
            {approxCount(tokensPerTrace.input)} input and{" "}
            {approxCount(tokensPerTrace.output)} output tokens per trace
          </span>
          <span className="text-muted-foreground">
            No price is set for {unpriced.join(" and ")}.{" "}
            <Link href={modelSettingsHref} className="underline">
              Add a model price
            </Link>{" "}
            to see a cost.
          </span>
        </div>
      ) : null}

      {done && estimate.sampled === 0 ? (
        <span className="text-muted-foreground text-sm">
          No finished traces match in the last 7 days, so there is nothing to
          measure yet.
        </span>
      ) : null}

      {done && estimate.sampled > 0 ? (
        <span className="text-muted-foreground text-xs">
          {`Estimated from ${estimate.sampled} recent traces. Actual cost depends on your provider.`}
        </span>
      ) : null}

      {estimate?.status === "failed" ? (
        <span className="text-destructive text-sm">{estimate.error}</span>
      ) : null}
      {error ? <span className="text-destructive text-sm">{error}</span> : null}
    </div>
  );
}
