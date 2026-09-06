import { Clock, Info } from "lucide-react";
import { assertUnreachable } from "@/src/utils/types";
import type { ScoreAnalyticsContextValue } from "./ScoreAnalyticsProvider";
import { SamplingDetailsHoverCard } from "./SamplingDetailsHoverCard";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("evaluationAnalytics.scoreAnalytics");

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
                ? t("processingLargeDataset")
                : t("loadingAnalytics")}
            </div>
            {estimate && (
              <div className="text-muted-foreground text-sm">
                {estimate.mode === "single"
                  ? t("analyzingSingle", {
                      count: estimate.score1Count.toLocaleString(),
                    })
                  : t("analyzingComparison", {
                      score1Count: estimate.score1Count.toLocaleString(),
                      score2Count: estimate.score2Count.toLocaleString(),
                    })}
                {estimate.willSample && ` • ${t("samplingApplied")}`}
                {estimate.estimatedQueryTime && (
                  <>
                    {` • ${t("estimatedTime", { time: estimate.estimatedQueryTime })}`}
                  </>
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
              {t("sampledData")}
              <SamplingDetailsHoverCard
                samplingMetadata={data.samplingMetadata}
                mode={data.metadata.mode}
              />
            </div>
            <div className="text-muted-foreground text-sm">
              {data.metadata.mode === "single"
                ? t("sampledSingle", {
                    rate: (data.samplingMetadata.samplingRate * 100).toFixed(2),
                    count:
                      data.samplingMetadata.preflightEstimates?.score1Count.toLocaleString() ??
                      "0",
                  })
                : t("sampledComparison", {
                    rate: (data.samplingMetadata.samplingRate * 100).toFixed(2),
                    score1Count:
                      data.samplingMetadata.preflightEstimates?.score1Count.toLocaleString() ??
                      "0",
                    score2Count:
                      data.samplingMetadata.preflightEstimates?.score2Count.toLocaleString() ??
                      "0",
                  })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return assertUnreachable(props);
}
