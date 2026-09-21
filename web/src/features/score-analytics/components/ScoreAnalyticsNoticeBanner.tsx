import { Clock, Info } from "lucide-react";
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
      <div className="bg-muted mb-4 rounded-md px-4 py-3">
        <div className="flex items-start gap-3">
          <Clock className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1 space-y-1">
            <div className="text-sm font-bold">
              {showLargeDataset
                ? "Processing large dataset..."
                : "Loading analytics..."}
            </div>
            {estimate && (
              <div className="text-muted-foreground text-sm">
                {estimate.mode === "single"
                  ? `Analyzing ~${estimate.score1Count.toLocaleString()} scores`
                  : `Analyzing ~${estimate.score1Count.toLocaleString()} (Score 1) and ~${estimate.score2Count.toLocaleString()} (Score 2) scores`}
                {estimate.willSample && " • Sampling will be applied"}
                {estimate.estimatedQueryTime && (
                  <> • Est. time: {estimate.estimatedQueryTime}</>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (props.variant === "sampled") {
    const { data } = props;

    return (
      <div className="bg-muted mb-4 rounded-md px-4 py-3">
        <div className="flex items-start gap-3">
          <Info className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2 text-sm font-bold">
              Sampled Data
              <SamplingDetailsHoverCard
                samplingMetadata={data.samplingMetadata}
                mode={data.metadata.mode}
              />
            </div>
            <div className="text-muted-foreground text-sm">
              {data.metadata.mode === "single"
                ? `Results based on a ${(data.samplingMetadata.samplingRate * 100).toFixed(2)}% sample of ~${data.samplingMetadata.preflightEstimates?.score1Count.toLocaleString()} scores.`
                : `Results based on a ${(data.samplingMetadata.samplingRate * 100).toFixed(2)}% sample of ~${data.samplingMetadata.preflightEstimates?.score1Count.toLocaleString()} Score 1 and ~${data.samplingMetadata.preflightEstimates?.score2Count.toLocaleString()} Score 2 data.`}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return assertUnreachable(props);
}
