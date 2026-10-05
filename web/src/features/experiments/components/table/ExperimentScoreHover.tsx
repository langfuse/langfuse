import { type ReactElement, useState } from "react";
import { type AggregatedScoreData } from "@langfuse/shared";
import { EMPTY_VALUE_PLACEHOLDER } from "@/src/components/design-system/table/constants";
import { Button } from "@/src/components/design-system/Button/Button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { Skeleton } from "@/src/components/ui/skeleton";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { type BaselineDiff } from "@/src/features/datasets";
import { decomposeAggregateScoreKey } from "@/src/features/scores";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { api } from "@/src/utils/api";
import { Check, Copy, ExternalLink } from "lucide-react";
import Link from "next/link";

/**
 * How one score reads in a cell: a categorical score's modal value, a numeric
 * score's average. Shared with the hover beside it, which has to quote the
 * same value the cell shows.
 */
export const scoreValueOf = (
  aggregate?: AggregatedScoreData | null,
): string => {
  if (!aggregate) return EMPTY_VALUE_PLACEHOLDER;
  if (aggregate.type === "CATEGORICAL") {
    if (aggregate.valueCounts && aggregate.valueCounts.length > 0) {
      return [...aggregate.valueCounts].sort((a, b) => b.count - a.count)[0]
        .value;
    }
    return aggregate.values?.[0] ?? EMPTY_VALUE_PLACEHOLDER;
  }
  return aggregate.average !== undefined
    ? aggregate.average.toFixed(2)
    : EMPTY_VALUE_PLACEHOLDER;
};

/**
 * Score details for a list or grid cell: value, source, type, comment,
 * metadata, and the evaluator's execution trace. The trigger is the cell's
 * own value so the same card can sit on a badge or on a named grid row.
 */
export function ExperimentScoreHover({
  scoreKey,
  aggregate,
  diff,
  projectId,
  children,
}: {
  scoreKey: string;
  aggregate: AggregatedScoreData | null;
  diff?: BaselineDiff | null;
  projectId: string;
  children: ReactElement;
}) {
  const { name, source, dataType } = decomposeAggregateScoreKey(scoreKey);
  const displayValue = scoreValueOf(aggregate);

  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { data: metadata, isError } = api.scores.getScoreMetadataById.useQuery(
    { projectId, id: aggregate?.id ?? "" },
    {
      enabled:
        isOpen && !!projectId && !!aggregate?.id && !!aggregate.hasMetadata,
      trpc: { context: { skipBatch: true } },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  return (
    <HoverCard onOpenChange={setIsOpen}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="max-h-[50vh] w-96 overflow-auto text-xs break-words whitespace-normal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col gap-3">
          <span className="font-bold">{name}</span>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted-foreground">Value</dt>
            <dd className="min-w-0">
              {displayValue}
              {diff?.type === "CATEGORICAL" && (
                <span className="text-muted-foreground ml-2 whitespace-normal">
                  {diff.from
                    ? `← Baseline: ${diff.from}`
                    : "Varies from baseline"}
                </span>
              )}
            </dd>
            <dt className="text-muted-foreground">Source</dt>
            <dd className="capitalize">{source.toLowerCase()}</dd>
            <dt className="text-muted-foreground">Type</dt>
            <dd className="capitalize">{dataType.toLowerCase()}</dd>
          </dl>
          {aggregate?.comment && (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Comment</span>
                <Button
                  variant="ghost"
                  size="sm"
                  text={copied ? "Copied" : "Copy comment"}
                  icon={copied ? Check : Copy}
                  onClick={async () => {
                    await copyTextToClipboard(aggregate.comment!);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                />
              </div>
              <p className="whitespace-pre-wrap">{aggregate.comment}</p>
            </div>
          )}
          {aggregate?.hasMetadata && aggregate.id && (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">Metadata</span>
              {isError && <p>Could not load metadata.</p>}
              {!isError && metadata !== undefined && (
                <JSONView json={metadata} />
              )}
              {!isError && metadata === undefined && (
                <Skeleton className="h-12 w-full" />
              )}
            </div>
          )}
          {aggregate?.executionTraceId && (
            <Link
              href={`/project/${projectId}/traces/${encodeURIComponent(aggregate.executionTraceId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              View execution trace
            </Link>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
