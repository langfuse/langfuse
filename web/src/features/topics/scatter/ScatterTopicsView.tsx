import { useMemo, useState, type ComponentProps } from "react";
import { useMediaQuery } from "react-responsive";
import { cn } from "@/src/utils/tailwind";
import { type DataTablePeekViewProps } from "@/src/components/table/peek";
import { TopicsEmptyState } from "../TopicsEmptyState";
import {
  type Facet,
  orderedFacetTopics,
  type TopicTraceQuery,
  type UseTopicTraces,
} from "../facet-topics";
import {
  prepareTopicDisplay,
  type TopicDisplay,
  UNASSIGNED_TOPIC_ID,
} from "../prepare-topic-display";
import { TopicTraceList } from "../TopicTraceList";
import { TopicsSplit } from "../TopicsSplit";
import {
  scatterSwatchColor,
  UNASSIGNED_SWATCH_COLOR,
} from "../topic-map-colors";
import { TopicsTraceToolbar } from "../TopicsTraceToolbar";
import { topicTraceQuery } from "../topic-trace-filters";
import { type useTopicTraceFilters } from "../useTopicTraceFilters";
import { ScatterMap } from "./ScatterMap";

/** The scatter above one-line topic rows, with the selected topic's traces beside them. */
export function ScatterTopicsView({
  projectId,
  facet,
  mapResult,
  onOpenTrace,
  traceFilters,
  peekView,
  tracePanelRef,
  useTraces,
}: ScatterTopicsViewProps) {
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  // The rows are the map's legend, so they take the scatter's colors.
  const topics = withScatterColors(
    prepareTopicDisplay(facet, "treemap").topics,
  );
  const selected =
    topics.find((topic) => topic.id === selectedTopicId) ?? topics[0];
  const searchTopics = orderedFacetTopics(facet);
  const isSearching =
    traceFilters.filters.length > 0 ||
    Boolean(traceFilters.searchQuery?.trim());
  const traces = useTraces(listQuery());
  function listQuery(): TopicTraceQuery | null {
    if (isSearching)
      return topicTraceQuery(
        traceFilters.filters,
        traceFilters.searchQuery,
        searchTopics,
      );
    return selected ? topicQuery(selected.id) : null;
  }
  // Picking a topic replaces an active search; picking the highlighted one again clears it.
  function selectTopic(topicId: string | null) {
    if (isSearching) {
      traceFilters.setFilters([]);
      traceFilters.setSearchQuery(null);
    }
    setSelectedTopicId(topicId);
  }
  const maxCount = Math.max(1, ...topics.map((topic) => topic.count));
  const isWide = useMediaQuery({ query: "(min-width: 1024px)" });
  const mapTopics = useScatterMapTopics(facet);
  const mapData = mapResult.data;
  const highlightedTraceIds = useMemo(() => {
    if (selectedTopicId === null || mapData?.status !== "ready")
      return undefined;
    const topicId =
      selectedTopicId === UNASSIGNED_TOPIC_ID ? null : selectedTopicId;
    return new Set(
      mapData.points
        .filter((point) => (point.topicId ?? null) === topicId)
        .map((point) => point.traceId),
    );
  }, [mapData, selectedTopicId]);
  if (facet.topics.length === 0 || !selected) {
    return <TopicsEmptyState />;
  }
  const rows = (
    <ul
      aria-label="Topics"
      className={cn(
        "scroll-fade-y flex min-h-0 flex-col gap-px overflow-y-auto p-4",
        // Five rows and the top of the sixth, so the list reads as scrollable.
        facet.map ? "h-52 shrink-0" : "flex-1",
      )}
    >
      {topics.map((topic, rank) => (
        <li key={topic.id}>
          <TopicRow
            topic={topic}
            maxCount={maxCount}
            faded={rank >= 6}
            selected={topic.id === selected.id}
            onSelect={() =>
              selectTopic(
                topic.id === selectedTopicId && !isSearching ? null : topic.id,
              )
            }
          />
        </li>
      ))}
    </ul>
  );
  return (
    <TopicsSplit
      id="topics-scatter-new-split"
      orientation={isWide ? "horizontal" : "vertical"}
      defaultTopicsSize="50%"
      topics={
        facet.map ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col">
              <ScatterMap
                key={facet.map.runId}
                query={mapResult}
                topics={mapTopics}
                selectedTopic={null}
                matchingTraceIds={highlightedTraceIds}
                onSelectTopic={selectTopic}
                onSelectTrace={(traceId) => {
                  if (traceId) onOpenTrace(traceId);
                  else selectTopic(null);
                }}
                selectedTraceId={null}
                fillContainer
              />
            </div>
            {rows}
          </div>
        ) : (
          rows
        )
      }
      traces={
        <TopicTraceList
          key={isSearching ? "search" : selected.id}
          projectId={projectId}
          title={isSearching ? "Matching traces" : selected.name}
          description={
            isSearching || selected.id === UNASSIGNED_TOPIC_ID
              ? undefined
              : selected.description
          }
          swatchColor={isSearching ? undefined : selected.color}
          traces={traces}
          totalCount={isSearching ? traces.rows.length : selected.count}
          tracingTopic={
            isSearching || selected.id === UNASSIGNED_TOPIC_ID
              ? undefined
              : { facet, name: selected.name }
          }
          peekView={peekView}
          tracePanelRef={tracePanelRef}
          divider="none"
          topicColors={new Map(topics.map((topic) => [topic.id, topic.color]))}
          toolbar={
            <TopicsTraceToolbar
              projectId={projectId}
              topics={searchTopics}
              filters={traceFilters.filters}
              onFiltersChange={traceFilters.setFilters}
              searchQuery={traceFilters.searchQuery}
              onSearchQueryChange={traceFilters.setSearchQuery}
            />
          }
        />
      }
    />
  );
}

type ScatterTopicsViewProps = {
  projectId: string;
  facet: Facet;
  mapResult: ComponentProps<typeof ScatterMap>["query"];
  onOpenTrace: (traceId: string) => void;
  /** The page's trace search and filters, shown above the trace list. */
  traceFilters: ReturnType<typeof useTopicTraceFilters>;
  peekView: DataTablePeekViewProps;
  tracePanelRef?: (element: HTMLElement | null) => void;
  useTraces: UseTopicTraces;
};

/** One line per topic, with a short bar beside the count. */
function TopicRow({
  topic,
  maxCount,
  selected,
  onSelect,
  faded,
}: {
  topic: TopicDisplay;
  maxCount: number;
  selected: boolean;
  onSelect: () => void;
  faded: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "hover:bg-muted focus-visible:ring-ring flex w-full items-center gap-4 rounded-md px-3 py-1.5 text-left focus-visible:ring-2 focus-visible:outline-hidden",
        selected && "bg-muted",
      )}
    >
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm",
          selected && "font-bold",
          topic.id === UNASSIGNED_TOPIC_ID && "text-muted-foreground",
        )}
        title={topic.name}
      >
        {topic.name}
      </span>
      <span aria-hidden className="bg-muted h-1 w-36 shrink-0 rounded-full">
        <span
          className={cn("block h-full rounded-full", faded && "opacity-60")}
          style={{
            width: `${(topic.count / maxCount) * 100}%`,
            backgroundColor: topic.color,
          }}
        />
      </span>
      <span className="text-muted-foreground w-8 shrink-0 text-right font-mono text-xs">
        {topic.count.toLocaleString()}
      </span>
    </button>
  );
}

/** Topics in the scatter's six colors, by rank; Unassigned stays grey. */
function withScatterColors(topics: TopicDisplay[]) {
  return topics.map((topic, rank) =>
    topic.id === UNASSIGNED_TOPIC_ID
      ? topic
      : { ...topic, color: scatterSwatchColor(rank) },
  );
}

/**
 * The map's topics in the scatter colors. The array only changes with the
 * map or the topic ranking, so a refresh keeps the map's camera and hover.
 */
function useScatterMapTopics(facet: Facet) {
  const mapTopics = facet.map?.topics;
  const rankKey = facet.topics.map((topic) => topic.id).join("\n");
  return useMemo(() => {
    const ranks = new Map(rankKey.split("\n").map((id, rank) => [id, rank]));
    return (mapTopics ?? []).map((topic) => {
      const rank = ranks.get(topic.id);
      return {
        ...topic,
        color:
          rank === undefined
            ? UNASSIGNED_SWATCH_COLOR
            : scatterSwatchColor(rank),
      };
    });
  }, [mapTopics, rankKey]);
}

function topicQuery(topicId: string): TopicTraceQuery {
  if (topicId === UNASSIGNED_TOPIC_ID) return { assigned: false };
  return { topicIds: { operator: "any of", values: [topicId] } };
}
