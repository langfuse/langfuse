import { type ScoreConfigDomain } from "@langfuse/shared";
import { TagList } from "@/src/features/tag";
import { buildLocalIsoDatePresentation } from "@/src/utils/dates";
import { type QueueItemScore } from "@/src/features/annotation-queues/lib/queueItemScores";
import { QueueItemScoreCell } from "./QueueItemScoreCell";
import { QueueTraceFieldCell } from "./QueueTraceFieldCell";
import { type QueueTraceColumn } from "@/src/features/annotation-queues/lib/queueTraceColumns";

/**
 * Compact read-only overview of a queue item: who and when the trace is from,
 * its tags, the queue's trace columns, and the current value for every queue
 * score config.
 */
export function QueueItemSummaryStrip({
  userId,
  timestamp,
  tags,
  traceFields = [],
  scores,
  configs,
}: {
  userId?: string | null;
  timestamp?: Date | null;
  tags?: string[];
  /** The queue's trace columns with this trace's raw values. */
  traceFields?: { column: QueueTraceColumn; value: string | null }[];
  scores: QueueItemScore[];
  configs: Pick<ScoreConfigDomain, "id" | "name" | "categories">[];
}) {
  const date = timestamp
    ? buildLocalIsoDatePresentation({ date: new Date(timestamp) })
    : null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b px-3 py-2 text-xs"
      data-testid="queue-item-summary-strip"
    >
      {userId && (
        <span className="flex min-w-0 items-center gap-1">
          <span className="text-muted-foreground">User</span>
          <span className="ph-no-capture truncate font-mono" title={userId}>
            {userId}
          </span>
        </span>
      )}
      {date && (
        <span className="flex items-center gap-1">
          <span className="text-muted-foreground">Time</span>
          <span className="font-mono" title={date.title}>
            {date.display}
          </span>
        </span>
      )}
      {tags && tags.length > 0 && (
        <span className="flex flex-wrap items-center gap-1">
          <TagList selectedTags={tags} isLoading={false} viewOnly />
        </span>
      )}
      {traceFields.map(({ column, value }) => (
        <span
          key={column.id}
          className="flex max-w-64 min-w-0 items-center gap-1"
        >
          <span className="text-muted-foreground shrink-0">{column.label}</span>
          {value ? (
            <span className="min-w-0 overflow-hidden">
              <QueueTraceFieldCell value={value} format={column.format} />
            </span>
          ) : (
            <span className="text-muted-foreground">–</span>
          )}
        </span>
      ))}
      {configs.map((config) => (
        <span
          key={config.id}
          className="flex max-w-64 min-w-0 items-center gap-1"
        >
          <span className="text-muted-foreground shrink-0">{config.name}</span>
          <QueueItemScoreCell scores={scores} config={config} emptyValue="–" />
        </span>
      ))}
    </div>
  );
}
