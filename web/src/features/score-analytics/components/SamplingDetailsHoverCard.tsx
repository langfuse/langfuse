import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { Info } from "lucide-react";

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
