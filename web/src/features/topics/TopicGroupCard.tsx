import { Badge } from "@/src/components/design-system/Badge/Badge";
import { cn } from "@/src/utils/tailwind";

export function TopicGroupCard({
  topic,
  color,
  isSelected,
  onSelect,
}: TopicGroupCardProps) {
  function selectTopic() {
    onSelect(topic.id);
  }
  return (
    <button
      onClick={selectTopic}
      aria-pressed={isSelected}
      className={cn(
        "ph-no-capture hover:bg-muted/50 flex flex-col gap-1 rounded-md border p-2 text-left",
        isSelected && "border-primary bg-muted/30",
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <h4 className="flex min-w-0 items-start gap-1.5 text-xs font-bold">
          <span
            className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          {topic.name}
        </h4>
        <Badge text={topic.count.toLocaleString()} size="sm" />
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        {topic.description}
      </p>
    </button>
  );
}

type TopicGroupCardProps = {
  topic: { id: string; name: string; count: number; description: string };
  color: string;
  isSelected: boolean;
  onSelect: (topicId: string) => void;
};
