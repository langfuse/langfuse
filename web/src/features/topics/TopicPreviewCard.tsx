import { type TopicDisplay } from "./prepare-topic-display";

/** Persistent touch counterpart to a topic's hover details. */
export function TopicPreviewCard({
  topic,
  total,
}: {
  topic: Pick<TopicDisplay, "name" | "description" | "count">;
  total: number;
}) {
  return (
    <div
      role="tooltip"
      className="ph-no-capture bg-popover text-popover-foreground pointer-events-none rounded-md border p-3 text-xs shadow-md"
    >
      <p className="font-bold">{topic.name}</p>
      <p className="text-muted-foreground mt-1">
        {topic.count.toLocaleString()} traces ·{" "}
        {Math.round((topic.count / Math.max(1, total)) * 100)}% of traces
      </p>
      {topic.description && (
        <p className="mt-1 line-clamp-3">{topic.description}</p>
      )}
      <p className="text-muted-foreground mt-2">Tap again to view traces</p>
    </div>
  );
}
