import { type ScoreConfigDomain } from "@langfuse/shared";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { cn } from "@/src/utils/tailwind";
import {
  formatQueueItemScore,
  resolveQueueItemScore,
  type QueueItemScore,
} from "@/src/features/annotation-queues/lib/queueItemScores";

const SOURCE_LABELS: Record<string, string> = {
  API: "API",
  EVAL: "an evaluator",
};

/**
 * Read-only value of a queue item for one config. A value nobody has reviewed
 * yet (written by the API or an evaluator, with no annotation) is shown faded
 * with a dashed outline.
 */
export function QueueItemScoreCell({
  scores,
  config,
  emptyValue,
}: {
  scores: QueueItemScore[];
  config: Pick<ScoreConfigDomain, "id" | "name" | "categories">;
  emptyValue?: string;
}) {
  const resolved = resolveQueueItemScore(scores, config);
  const formatted = resolved
    ? formatQueueItemScore(resolved.score, config)
    : undefined;
  if (!resolved || !formatted) {
    return <span className="text-muted-foreground">{emptyValue}</span>;
  }

  const pendingTitle = resolved.pending
    ? `Not reviewed yet, value from ${SOURCE_LABELS[resolved.score.source] ?? resolved.score.source}`
    : undefined;
  const value = (() => {
    switch (formatted.kind) {
      case "badge":
        return (
          <Badge size="md" color={formatted.color} text={formatted.text} />
        );
      case "number":
        return <span className="font-mono">{formatted.text}</span>;
      case "text":
        return (
          <span className="ph-no-capture block w-full truncate">
            {formatted.text}
          </span>
        );
    }
  })();

  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0",
        formatted.kind === "text" && "w-full",
        resolved.pending &&
          "rounded-sm italic opacity-60 outline-1 outline-offset-1 outline-dashed",
      )}
      title={
        formatted.kind === "text"
          ? [formatted.text, pendingTitle].filter(Boolean).join("\n\n")
          : pendingTitle
      }
      data-pending={resolved.pending || undefined}
    >
      {value}
    </span>
  );
}
