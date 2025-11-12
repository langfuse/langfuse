import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { Clock, Info } from "lucide-react";
import { useScoreAnalytics } from "./ScoreAnalyticsProvider";
import { useState, useEffect } from "react";

export function ScoreAnalyticsNoticeBanner() {
  const { isEstimating, estimate, isLoading, data } = useScoreAnalytics();
  const [showLoadingBanner, setShowLoadingBanner] = useState(false);

  // Track when estimation starts and set delay for showing loading banner
  useEffect(() => {
    if (isEstimating || (estimate && isLoading)) {
      // Start timer - show banner after 1.5 seconds
      const timer = setTimeout(() => {
        setShowLoadingBanner(true);
      }, 1500);

      return () => clearTimeout(timer);
    } else {
      // Reset when loading completes
      setShowLoadingBanner(false);
    }
  }, [isEstimating, estimate, isLoading]);

  // Don't show anything if we haven't started
  if (!isEstimating && !estimate) return null;

  // State 1: Estimating (loading)
  if (isEstimating || (estimate && isLoading)) {
    const showLargeDataset =
      estimate && estimate.estimatedMatchedCount > 100_000;

    // Only show banner if:
    // 1. Delay has passed, OR
    // 2. We have estimate data showing it's a large dataset
    if (!showLoadingBanner && !showLargeDataset) {
      return null;
    }

    return (
      <div className="mb-4 rounded-md bg-muted px-4 py-3">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex-1 space-y-1">
            <div className="text-sm font-medium">
              {showLargeDataset
                ? "Processing large dataset..."
                : "Loading analytics..."}
            </div>
            {estimate && (
              <div className="text-sm text-muted-foreground">
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

  // State 2: Loaded with sampling
  if (data?.samplingMetadata.isSampled) {
    return (
      <div className="mb-4 rounded-md bg-muted px-4 py-3">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              Sampled Data
              <SamplingDetailsHoverCard
                samplingMetadata={data.samplingMetadata}
                mode={data.metadata.mode}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {data.metadata.mode === "single"
                ? `Results based on a ${(data.samplingMetadata.samplingRate * 100).toFixed(2)}% sample of ~${data.samplingMetadata.preflightEstimates?.score1Count.toLocaleString()} scores.`
                : `Results based on a ${(data.samplingMetadata.samplingRate * 100).toFixed(2)}% sample of ~${data.samplingMetadata.preflightEstimates?.score1Count.toLocaleString()} Score 1 and ~${data.samplingMetadata.preflightEstimates?.score2Count.toLocaleString()} Score 2 data.`}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // State 3: Loaded without sampling (don't show banner)
  return null;
}

function SamplingDetailsHoverCard({
  samplingMetadata,
  mode = "two",
  showLabel = false,
}: {
  samplingMetadata: {
    samplingRate: number;
    preflightEstimates?: {
      score1Count: number;
      score2Count: number;
      estimatedMatchedCount: number;
    };
    adaptiveFinal?: {
      usedFinal: boolean;
      reason: string;
    };
  };
  mode?: "single" | "two";
  showLabel?: boolean;
}) {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <button
          className={
            showLabel
              ? "inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              : "inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-muted-foreground/10"
          }
          aria-label="View sampling details"
        >
          {showLabel && <span>Sampled Data</span>}
          <Info
            className={showLabel ? "h-3 w-3" : "h-3 w-3 text-muted-foreground"}
          />
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-80" align="start">
        <div className="space-y-3">
          <div>
            <h4 className="mb-2 text-sm font-semibold">
              {mode === "single" ? "Estimated Score Count" : "Estimated Scores"}
            </h4>
            <dl className="space-y-1 text-sm">
              {mode === "single" ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Total Scores:</dt>
                  <dd className="font-medium">
                    ~
                    {samplingMetadata.preflightEstimates?.score1Count.toLocaleString()}
                  </dd>
                </div>
              ) : (
                <>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Score 1:</dt>
                    <dd className="font-medium">
                      ~
                      {samplingMetadata.preflightEstimates?.score1Count.toLocaleString()}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Score 2:</dt>
                    <dd className="font-medium">
                      ~
                      {samplingMetadata.preflightEstimates?.score2Count.toLocaleString()}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">
                      Estimated Matches:
                    </dt>
                    <dd className="font-medium">
                      ~
                      {samplingMetadata.preflightEstimates?.estimatedMatchedCount.toLocaleString()}
                    </dd>
                  </div>
                </>
              )}
            </dl>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-semibold">Query Optimizations</h4>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Sampling:</dt>
                <dd className="font-medium">
                  {(samplingMetadata.samplingRate * 100).toFixed(1)}%
                  (hash-based)
                </dd>
              </div>
              {samplingMetadata.adaptiveFinal && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Deduplication:</dt>
                  <dd className="font-medium">
                    {samplingMetadata.adaptiveFinal.usedFinal
                      ? "Enabled"
                      : "Skipped for performance"}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <p className="text-xs text-muted-foreground">
            Hash-based sampling ensures consistent, repeatable results while
            maintaining statistical accuracy.
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

// Export the hover card component for reuse in StatisticsCard
export { SamplingDetailsHoverCard };
