import { useState } from "react";
import { type DataTablePeekViewProps } from "@/src/components/table/peek";
import { cn } from "@/src/utils/tailwind";
import { TopicsEmptyState } from "./TopicsEmptyState";
import { type Facet } from "./facet-topics";
import {
  prepareTopicDisplay,
  UNASSIGNED_TOPIC_ID,
} from "./prepare-topic-display";
import { TopicTreemap } from "./TopicTreemap";
import { TopicTraceList } from "./TopicTraceList";

type TopicTreemapViewProps = {
  projectId: string;
  facet: Facet;
  peekView: DataTablePeekViewProps;
  onGenerateTopics: () => void;
  canGenerateTopics: boolean;
  /** Treemap left, traces right on wide screens. */
  sideBySide?: boolean;
  /** Applied to the trace list only when side by side, so the peek matches its width. */
  tracePanelRef?: (element: HTMLElement | null) => void;
};

export function TopicTreemapView({
  projectId,
  facet,
  peekView,
  onGenerateTopics,
  canGenerateTopics,
  sideBySide = false,
  tracePanelRef,
}: TopicTreemapViewProps) {
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  if (facet.topics.length === 0) {
    return (
      <TopicsEmptyState
        onGenerateTopics={onGenerateTopics}
        canGenerateTopics={canGenerateTopics}
      />
    );
  }
  const { topics, total } = prepareTopicDisplay(facet, "treemap");
  const selected =
    topics.find((topic) => topic.id === selectedTopicId) ?? topics[0];
  const selectedRowTopicId =
    selected.id === UNASSIGNED_TOPIC_ID ? null : selected.id;
  const rows = facet.rows.filter(
    (row) => (row.topicId ?? null) === selectedRowTopicId,
  );
  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        sideBySide && "lg:flex-row",
      )}
    >
      <div
        className={cn(
          "m-4 flex min-h-48 shrink-0 basis-1/2",
          sideBySide && "lg:shrink lg:basis-3/5",
        )}
      >
        <TopicTreemap
          total={total}
          topics={topics}
          selectedTopicId={selected.id}
          onSelectTopic={setSelectedTopicId}
        />
      </div>
      <TopicTraceList
        key={selected.id}
        projectId={projectId}
        title={selected.name}
        description={
          selected.id === UNASSIGNED_TOPIC_ID ? undefined : selected.description
        }
        swatchColor={selected.color}
        rows={rows}
        peekView={peekView}
        tracePanelRef={sideBySide ? tracePanelRef : undefined}
        divider={sideBySide ? "side" : "top"}
      />
    </div>
  );
}
