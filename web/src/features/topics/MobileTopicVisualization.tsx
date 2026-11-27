import { type ComponentProps } from "react";
import { type Facet } from "./facet-topics";
import {
  type TopicDisplay,
  UNASSIGNED_TOPIC_ID,
} from "./prepare-topic-display";
import { type MobileTopicsVisualization } from "./TopicsResultsViewSelect";
import { ScatterMap } from "./scatter/ScatterMap";
import { TopicTreemap } from "./TopicTreemap";

type MobileTopicVisualizationProps = {
  view: MobileTopicsVisualization;
  facet: Facet;
  treemapTopics: TopicDisplay[];
  mapResult: ComponentProps<typeof ScatterMap>["query"];
  selectedTopicId: string | null;
  selectedTraceId: string | null;
  matchingTraceIds?: ReadonlySet<string>;
  onSelectTopic: (topicId: string | null) => void;
  onSelectTrace: (traceId: string | null) => void;
};

export function MobileTopicVisualization({
  view,
  facet,
  treemapTopics,
  mapResult,
  selectedTopicId,
  selectedTraceId,
  matchingTraceIds,
  onSelectTopic,
  onSelectTrace,
}: MobileTopicVisualizationProps) {
  function selectMapTopic(topicId: string | null) {
    // Fitting the camera leaves the trace filters and active panel intact.
    if (topicId !== null) onSelectTopic(topicId);
  }
  if (view === "treemap") {
    return treemapTopics.length > 0 ? (
      <TopicTreemap
        key={facet.facetId}
        total={facet.counts.total}
        topics={treemapTopics}
        selectedTopicId={selectedTopicId}
        onSelectTopic={onSelectTopic}
        previewOnSelect
      />
    ) : (
      <p className="text-muted-foreground p-4 text-sm">
        No topics in this time range. Browse traces to read their summaries.
      </p>
    );
  }
  if (!facet.map) {
    return (
      <p className="text-muted-foreground p-4 text-sm">
        No map published for this facet. Browse topics or traces instead.
      </p>
    );
  }
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col p-2">
      <ScatterMap
        key={facet.map.runId}
        query={mapResult}
        topics={facet.map.topics}
        selectedTopic={null}
        pickedTopic={
          selectedTopicId === UNASSIGNED_TOPIC_ID ? null : selectedTopicId
        }
        selectedTraceId={selectedTraceId}
        matchingTraceIds={matchingTraceIds}
        onSelectTopic={selectMapTopic}
        onSelectTrace={onSelectTrace}
        previewOnSelect
        fillContainer
      />
    </div>
  );
}
