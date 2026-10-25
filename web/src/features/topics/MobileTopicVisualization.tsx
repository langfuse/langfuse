import { type ComponentProps } from "react";
import { type Facet } from "./facet-topics";
import { type TopicDisplay } from "./prepare-topic-display";
import { TopicEmbeddingMap } from "./TopicEmbeddingMap";
import { TopicGrid } from "./TopicGrid";
import { TopicTreemap } from "./TopicTreemap";
import { prepareTopicGrid } from "./prepare-topic-grid";
import { type TopicsResultsView } from "./TopicsResultsViewSelect";

type MobileTopicVisualizationProps = {
  view: TopicsResultsView;
  facet: Facet;
  treemapTopics: TopicDisplay[];
  mapResult: ComponentProps<typeof TopicEmbeddingMap>["query"];
  selectedTopicId: string | null;
  selectedTraceId: string | null;
  matchingTraceIds?: ReadonlySet<string>;
  onSelectTopic: (topicId: string | null) => void;
  onSelectTrace: (traceId: string | null) => void;
};

function gridMessage(query: MobileTopicVisualizationProps["mapResult"]) {
  if (query.error) return `Grid could not load: ${query.error.message}`;
  if (!query.data) return "Loading grid…";
  return query.data.reason ?? "This run has no saved embedding projection.";
}

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
      <div className="flex min-h-0 flex-1 p-4">
        <TopicTreemap
          key={facet.facetId}
          total={facet.rows.length}
          topics={treemapTopics}
          selectedTopicId={selectedTopicId}
          onSelectTopic={onSelectTopic}
          previewOnSelect
        />
      </div>
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
  if (view === "map") {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col p-2">
        <TopicEmbeddingMap
          key={facet.map.runId}
          query={mapResult}
          topics={facet.map.topics}
          selectedTopic={null}
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
  if (mapResult.error || !mapResult.data || mapResult.data.status !== "ready") {
    return (
      <p className="text-muted-foreground p-4 text-sm">
        {gridMessage(mapResult)}
      </p>
    );
  }
  const grid = prepareTopicGrid(facet, mapResult.data);
  const selectedIndex = grid.topics.findIndex(
    (topic) => topic.id === selectedTopicId,
  );
  return (
    <TopicGrid
      key={facet.map.runId}
      {...grid}
      selectedIndex={selectedIndex < 0 ? null : selectedIndex}
      onSelectTopic={onSelectTopic}
      onSelectTrace={onSelectTrace}
      previewOnSelect
    />
  );
}
