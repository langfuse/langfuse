import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { Info } from "lucide-react";
import { useTranslations } from "next-intl";

interface SamplingMetadata {
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
}

interface SamplingDetailsHoverCardProps {
  samplingMetadata: SamplingMetadata;
  mode?: "single" | "two";
  showLabel?: boolean;
}

export function SamplingDetailsHoverCard({
  samplingMetadata,
  mode = "two",
  showLabel = false,
}: SamplingDetailsHoverCardProps) {
  const t = useTranslations("evaluationAnalytics.scoreAnalytics");
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <button
          className={
            showLabel
              ? "text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
              : "hover:bg-muted-foreground/10 inline-flex h-4 w-4 items-center justify-center rounded-full"
          }
          aria-label={t("viewSamplingDetails")}
        >
          {showLabel && <span>{t("sampledData")}</span>}
          <Info
            className={showLabel ? "h-3 w-3" : "text-muted-foreground h-3 w-3"}
          />
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-80" align="start">
        <div className="space-y-3">
          <div>
            <h4 className="mb-2 text-sm font-bold">
              {mode === "single"
                ? t("estimatedScoreCount")
                : t("estimatedScores")}
            </h4>
            <dl className="space-y-1 text-sm">
              {mode === "single" ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("totalScores")}</dt>
                  <dd className="font-bold">
                    ~
                    {samplingMetadata.preflightEstimates?.score1Count.toLocaleString()}
                  </dd>
                </div>
              ) : (
                <>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t("score1")}</dt>
                    <dd className="font-bold">
                      ~
                      {samplingMetadata.preflightEstimates?.score1Count.toLocaleString()}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t("score2")}</dt>
                    <dd className="font-bold">
                      ~
                      {samplingMetadata.preflightEstimates?.score2Count.toLocaleString()}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">
                      {t("estimatedMatches")}
                    </dt>
                    <dd className="font-bold">
                      ~
                      {samplingMetadata.preflightEstimates?.estimatedMatchedCount.toLocaleString()}
                    </dd>
                  </div>
                </>
              )}
            </dl>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-bold">
              {t("queryOptimizations")}
            </h4>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("sampling")}</dt>
                <dd className="font-bold">
                  {(samplingMetadata.samplingRate * 100).toFixed(1)}%
                  {` (${t("hashBased")})`}
                </dd>
              </div>
              {samplingMetadata.adaptiveFinal && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    {t("deduplication")}
                  </dt>
                  <dd className="font-bold">
                    {samplingMetadata.adaptiveFinal.usedFinal
                      ? t("enabled")
                      : t("skippedForPerformance")}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <p className="text-muted-foreground text-xs">
            {t("samplingDescription")}
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
