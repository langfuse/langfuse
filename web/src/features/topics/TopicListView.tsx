import { useState } from "react";
import { useMediaQuery } from "react-responsive";
import { cn } from "@/src/utils/tailwind";
import { type DataTablePeekViewProps } from "@/src/components/table/peek";
import { TopicsEmptyState } from "./TopicsEmptyState";
import {
  type Facet,
  type TopicTraceQuery,
  type UseTopicTraces,
} from "./facet-topics";
import {
  prepareTopicDisplay,
  type TopicDisplay,
  UNASSIGNED_TOPIC_ID,
} from "./prepare-topic-display";
import { TopicTraceList } from "./TopicTraceList";
import { TopicsSplit } from "./TopicsSplit";
import { UNASSIGNED_SWATCH_COLOR } from "./topic-map-colors";

/** Only the largest topics keep their map color; the rest are grey. */
const COLORED_RANKS = 3;

type TopicListViewProps = {
  projectId: string;
  facet: Facet;
  peekView: DataTablePeekViewProps;
  tracePanelRef?: (element: HTMLElement | null) => void;
  useTraces: UseTopicTraces;
};

/** Topics as a table, largest first, with the selected topic's traces beside it. */
export function TopicListView({
  projectId,
  facet,
  peekView,
  tracePanelRef,
  useTraces,
}: TopicListViewProps) {
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const topics = prepareTopicDisplay(facet, "treemap").topics.map(
    (topic, rank) =>
      rank < COLORED_RANKS
        ? topic
        : { ...topic, color: UNASSIGNED_SWATCH_COLOR },
  );
  const selected =
    topics.find((topic) => topic.id === selectedTopicId) ?? topics[0];
  const traces = useTraces(selected ? topicQuery(selected.id) : null);
  const maxCount = Math.max(1, ...topics.map((topic) => topic.count));
  const isWide = useMediaQuery({ query: "(min-width: 1024px)" });
  if (facet.topics.length === 0 || !selected) {
    return <TopicsEmptyState />;
  }
  return (
    <TopicsSplit
      id="topics-list-split"
      orientation={isWide ? "horizontal" : "vertical"}
      defaultTopicsSize={isWide ? "40%" : "50%"}
      topics={
        <ul
          aria-label="Topics"
          className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto p-4"
        >
          {topics.map((topic) => (
            <li key={topic.id}>
              <TopicRow
                topic={topic}
                maxCount={maxCount}
                selected={topic.id === selected.id}
                onSelect={() => setSelectedTopicId(topic.id)}
              />
            </li>
          ))}
        </ul>
      }
      traces={
        <TopicTraceList
          key={selected.id}
          projectId={projectId}
          title={selected.name}
          description={
            selected.id === UNASSIGNED_TOPIC_ID
              ? undefined
              : selected.description
          }
          swatchColor={selected.color}
          traces={traces}
          totalCount={selected.count}
          tracingTopic={
            selected.id === UNASSIGNED_TOPIC_ID
              ? undefined
              : { facet, name: selected.name }
          }
          peekView={peekView}
          tracePanelRef={tracePanelRef}
          divider="none"
        />
      }
    />
  );
}

function TopicRow({
  topic,
  maxCount,
  selected,
  onSelect,
}: {
  topic: TopicDisplay;
  maxCount: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "hover:bg-muted focus-visible:ring-ring flex w-full flex-col gap-2 rounded-md px-3 py-3 text-left focus-visible:ring-2 focus-visible:outline-hidden",
        selected && "bg-muted",
      )}
    >
      <span className="flex min-w-0 items-baseline justify-between gap-3">
        <span
          className={cn("truncate text-sm", selected && "font-bold")}
          title={topic.name}
        >
          {topic.name}
        </span>
        <span className="text-muted-foreground shrink-0 font-mono text-xs">
          {topic.count.toLocaleString()}
        </span>
      </span>
      <span aria-hidden className="bg-muted h-1.5 w-full rounded-full">
        <span
          className="block h-full rounded-full"
          style={{
            width: `${(topic.count / maxCount) * 100}%`,
            backgroundColor: topic.color,
          }}
        />
      </span>
    </button>
  );
}

function topicQuery(topicId: string): TopicTraceQuery {
  if (topicId === UNASSIGNED_TOPIC_ID) return { assigned: false };
  return { topicIds: { operator: "any of", values: [topicId] } };
}
