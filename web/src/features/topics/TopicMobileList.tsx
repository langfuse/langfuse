import { ChevronRight } from "@langfuse/icons";
import { cn } from "@/src/utils/tailwind";
import { type TopicDisplay } from "./prepare-topic-display";

type TopicMobileListProps = {
  topics: Pick<
    TopicDisplay,
    "id" | "name" | "description" | "count" | "color"
  >[];
  totalCount: number;
  selectedTopicId: string | null;
  onSelectTopic: (id: string) => void;
  onShowAllTraces: () => void;
};

/** Every topic has a readable label and a touch target independent of its size. */
export function TopicMobileList({
  topics,
  totalCount,
  selectedTopicId,
  onSelectTopic,
  onShowAllTraces,
}: TopicMobileListProps) {
  return (
    <div className="ph-no-capture flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
      <button
        type="button"
        onClick={onShowAllTraces}
        className="hover:bg-accent focus-visible:ring-ring flex min-h-12 items-center justify-between gap-3 border-b px-4 py-3 text-left text-sm focus-visible:ring-2 focus-visible:ring-inset"
      >
        <span className="font-bold">All traces</span>
        <span className="text-muted-foreground flex items-center gap-2 tabular-nums">
          {totalCount.toLocaleString()}
          <ChevronRight size="base" aria-hidden />
        </span>
      </button>
      <ul className="divide-y">
        {topics.map((topic) => (
          <li key={topic.id}>
            <button
              type="button"
              aria-label={`${topic.name}, ${topic.count} traces`}
              aria-pressed={selectedTopicId === topic.id}
              onClick={() => onSelectTopic(topic.id)}
              className={cn(
                "hover:bg-accent focus-visible:ring-ring flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left text-sm focus-visible:ring-2 focus-visible:ring-inset",
                selectedTopicId === topic.id && "bg-accent",
              )}
            >
              <span
                aria-hidden
                className="mt-1.5 size-2.5 shrink-0 rounded-xs"
                style={{ backgroundColor: topic.color }}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-bold [overflow-wrap:anywhere]">
                  {topic.name}
                </span>
                {topic.description && (
                  <span className="text-muted-foreground line-clamp-2 [overflow-wrap:anywhere]">
                    {topic.description}
                  </span>
                )}
              </span>
              <span className="text-muted-foreground flex shrink-0 items-center gap-2 tabular-nums">
                {topic.count.toLocaleString()}
                <ChevronRight size="base" aria-hidden />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {topics.length === 0 && (
        <p className="text-muted-foreground p-4 text-sm">
          No topics in this time range. You can still browse all trace
          summaries.
        </p>
      )}
    </div>
  );
}
