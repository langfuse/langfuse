import { useState } from "react";
import { useMediaQuery } from "react-responsive";
import { type DataTablePeekViewProps } from "@/src/components/table/peek";
import { TopicsEmptyState } from "./TopicsEmptyState";
import {
  type Facet,
  type TopicTraceQuery,
  type UseTopicTraces,
} from "./facet-topics";
import {
  prepareTopicDisplay,
  UNASSIGNED_TOPIC_ID,
} from "./prepare-topic-display";
import { TopicTreemap } from "./TopicTreemap";
import { TopicTraceList } from "./TopicTraceList";
import { TopicsSplit } from "./TopicsSplit";

type TopicTreemapViewProps = {
  projectId: string;
  facet: Facet;
  peekView: DataTablePeekViewProps;
  /** Treemap left, traces right on wide screens. */
  sideBySide?: boolean;
  /** Applied to the trace list only when side by side, so the peek matches its width. */
  tracePanelRef?: (element: HTMLElement | null) => void;
  useTraces: UseTopicTraces;
  /** Off leaves unassigned traces out of the all-traces list, as their tile is hidden. */
  showUnassigned?: boolean;
};

export function TopicTreemapView({
  projectId,
  facet,
  peekView,
  sideBySide = false,
  tracePanelRef,
  useTraces,
  showUnassigned = true,
}: TopicTreemapViewProps) {
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const { topics, total } = prepareTopicDisplay(facet, "treemap");
  // No tile picked lists every trace; picking a tile again clears it.
  const selected = topics.find((topic) => topic.id === selectedTopicId);
  const allTraces = showUnassigned ? {} : { assigned: true };
  const traces = useTraces(selected ? topicQuery(selected.id) : allTraces);
  const isWide = useMediaQuery({ query: "(min-width: 1024px)" });
  const horizontal = sideBySide && isWide;
  if (facet.topics.length === 0) {
    return <TopicsEmptyState />;
  }
  return (
    <TopicsSplit
      id="topics-treemap-split"
      orientation={horizontal ? "horizontal" : "vertical"}
      defaultTopicsSize={horizontal ? "60%" : "50%"}
      topics={
        <TopicTreemap
          total={total}
          topics={topics}
          selectedTopicId={selected?.id ?? null}
          onSelectTopic={(topicId) =>
            setSelectedTopicId(topicId === selectedTopicId ? null : topicId)
          }
        />
      }
      traces={
        <TopicTraceList
          key={selected?.id ?? "all"}
          rowHeightKey="topicTracesTreemap"
          projectId={projectId}
          title={selected ? selected.name : "All traces"}
          description={
            !selected || selected.id === UNASSIGNED_TOPIC_ID
              ? undefined
              : selected.description
          }
          swatchColor={selected?.color}
          traces={traces}
          totalCount={selected ? selected.count : facet.counts.total}
          tracingTopic={
            !selected || selected.id === UNASSIGNED_TOPIC_ID
              ? undefined
              : { facet, name: selected.name }
          }
          topicColors={new Map(topics.map((topic) => [topic.id, topic.color]))}
          peekView={peekView}
          tracePanelRef={horizontal ? tracePanelRef : undefined}
          divider="none"
        />
      }
    />
  );
}

function topicQuery(topicId: string): TopicTraceQuery {
  if (topicId === UNASSIGNED_TOPIC_ID) return { assigned: false };
  return { topicIds: { operator: "any of", values: [topicId] } };
}
