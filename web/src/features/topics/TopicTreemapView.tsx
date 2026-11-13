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
};

export function TopicTreemapView({
  projectId,
  facet,
  peekView,
  sideBySide = false,
  tracePanelRef,
  useTraces,
}: TopicTreemapViewProps) {
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const { topics, total } = prepareTopicDisplay(facet, "treemap");
  const selected =
    topics.find((topic) => topic.id === selectedTopicId) ?? topics[0];
  const traces = useTraces(selected ? topicQuery(selected.id) : null);
  const isWide = useMediaQuery({ query: "(min-width: 1024px)" });
  const horizontal = sideBySide && isWide;
  if (facet.topics.length === 0 || !selected) {
    return <TopicsEmptyState />;
  }
  return (
    <TopicsSplit
      id="topics-treemap-split"
      orientation={horizontal ? "horizontal" : "vertical"}
      defaultTopicsSize={horizontal ? "60%" : "50%"}
      topics={
        <div className="flex min-h-0 flex-1 p-4">
          <TopicTreemap
            total={total}
            topics={topics}
            selectedTopicId={selected.id}
            onSelectTopic={setSelectedTopicId}
          />
        </div>
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
