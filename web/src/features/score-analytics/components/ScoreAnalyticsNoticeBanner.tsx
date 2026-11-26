import { Clock } from "@langfuse/icons";
import { Banner } from "@/src/components/design-system/Banner/Banner";
import { assertUnreachable } from "@/src/utils/types";
import type { ScoreAnalyticsContextValue } from "./ScoreAnalyticsProvider";
import { SamplingDetailsHoverCard } from "./SamplingDetailsHoverCard";

type ScoreAnalyticsNoticeBannerProps =
  | {
      variant: "loading";
      estimate: ScoreAnalyticsContextValue["estimate"];
    }
  | {
      variant: "sampled";
      data: NonNullable<ScoreAnalyticsContextValue["data"]>;
    };

export function ScoreAnalyticsNoticeBanner(
  props: ScoreAnalyticsNoticeBannerProps,
) {
  if (props.variant === "loading") {
    const { estimate } = props;
    const showLargeDataset = Boolean(
      estimate && estimate.estimatedMatchedCount > 100_000,
    );

    return (
      <div className="mb-4">
        <Banner
          icon={Clock}
          title={
            showLargeDataset
              ? "Processing large dataset..."
              : "Loading analytics..."
          }
        >
          {estimate && (
            <>
              {estimate.mode === "single"
                ? `Analyzing ~${estimate.score1Count.toLocaleString()} scores`
                : `Analyzing ~${estimate.score1Count.toLocaleString()} (Score 1) and ~${estimate.score2Count.toLocaleString()} (Score 2) scores`}
              {estimate.willSample && " • Sampling will be applied"}
              {estimate.estimatedQueryTime && (
                <> • Est. time: {estimate.estimatedQueryTime}</>
              )}
            </>
          )}
        </Banner>
      </div>
    );
  }

  if (props.variant === "sampled") {
    const { data } = props;

    return (
      <div className="mb-4">
        <Banner title="Sampled data">
          {data.metadata.mode === "single"
            ? `Results based on a ${(data.samplingMetadata.samplingRate * 100).toFixed(2)}% sample of ~${data.samplingMetadata.preflightEstimates?.score1Count.toLocaleString()} scores.`
            : `Results based on a ${(data.samplingMetadata.samplingRate * 100).toFixed(2)}% sample of ~${data.samplingMetadata.preflightEstimates?.score1Count.toLocaleString()} Score 1 and ~${data.samplingMetadata.preflightEstimates?.score2Count.toLocaleString()} Score 2 data.`}{" "}
          <span className="inline-flex align-middle">
            <SamplingDetailsHoverCard
              samplingMetadata={data.samplingMetadata}
              mode={data.metadata.mode}
            />
          </span>
        </Banner>
      </div>
    );
  }

  return assertUnreachable(props);
}
