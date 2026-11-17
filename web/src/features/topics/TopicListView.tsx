import { useMemo, useState, type ComponentProps } from "react";
import { useMediaQuery } from "react-responsive";
import { cn } from "@/src/utils/tailwind";
import { type DataTablePeekViewProps } from "@/src/components/table/peek";
import { TopicsEmptyState } from "./TopicsEmptyState";
import {
  type Facet,
  orderedFacetTopics,
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
import {
  scatterSwatchColor,
  UNASSIGNED_SWATCH_COLOR,
} from "./topic-map-colors";
import { TopicEmbeddingMap } from "./TopicEmbeddingMap";
import { TopicsTraceToolbar } from "./TopicsTraceToolbar";
import { topicTraceQuery } from "./topic-trace-filters";
import { type useTopicTraceFilters } from "./useTopicTraceFilters";

/** Only the largest topics keep their map color; the rest are grey. */
const COLORED_RANKS = 3;

type TopicListViewProps = {
  projectId: string;
  facet: Facet;
  peekView: DataTablePeekViewProps;
  tracePanelRef?: (element: HTMLElement | null) => void;
  useTraces: UseTopicTraces;
  /** Draws the scatter above the topic rows. Picking the highlighted topic again clears the highlight. */
  scatter?: {
    query: ComponentProps<typeof TopicEmbeddingMap>["query"];
    onOpenTrace: (traceId: string) => void;
    /** The page's trace search and filters, shown above the trace list. */
    traceFilters?: ReturnType<typeof useTopicTraceFilters>;
  };
};

/** Topics as a table, largest first, with the selected topic's traces beside it. */
export function TopicListView({
  projectId,
  facet,
  peekView,
  tracePanelRef,
  useTraces,
  scatter,
}: TopicListViewProps) {
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const treemapTopics = prepareTopicDisplay(facet, "treemap").topics;
  // Scatter rows are the map's legend, so they take the scatter's colors.
  const topics = scatter
    ? withScatterColors(treemapTopics)
    : treemapTopics.map((topic, rank) =>
        rank < COLORED_RANKS
          ? topic
          : { ...topic, color: UNASSIGNED_SWATCH_COLOR },
      );
  const selected =
    topics.find((topic) => topic.id === selectedTopicId) ?? topics[0];
  const search = scatter?.traceFilters;
  const searchTopics = orderedFacetTopics(facet);
  const isSearching = Boolean(
    search && (search.filters.length > 0 || search.searchQuery?.trim()),
  );
  const traces = useTraces(listQuery());
  function listQuery(): TopicTraceQuery | null {
    if (isSearching && search)
      return topicTraceQuery(search.filters, search.searchQuery, searchTopics);
    return selected ? topicQuery(selected.id) : null;
  }
  // Picking a topic replaces an active search.
  function selectTopic(topicId: string | null) {
    if (isSearching && search) {
      search.setFilters([]);
      search.setSearchQuery(null);
    }
    setSelectedTopicId(topicId);
  }
  const maxCount = Math.max(1, ...topics.map((topic) => topic.count));
  const isWide = useMediaQuery({ query: "(min-width: 1024px)" });
  const mapTopics = useScatterMapTopics(facet);
  const mapData = scatter?.query.data;
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
      className="scroll-fade-y flex min-h-0 flex-1 flex-col gap-px overflow-y-auto p-4"
    >
      {topics.map((topic) => (
        <li key={topic.id}>
          <TopicRow
            topic={topic}
            maxCount={maxCount}
            selected={topic.id === selected.id}
            onSelect={() =>
              selectTopic(
                scatter && topic.id === selectedTopicId && !isSearching
                  ? null
                  : topic.id,
              )
            }
          />
        </li>
      ))}
    </ul>
  );
  return (
    <TopicsSplit
      id={scatter ? "topics-scatter-split-half" : "topics-list-split-half"}
      orientation={isWide ? "horizontal" : "vertical"}
      defaultTopicsSize="50%"
      topics={
        scatter && facet.map ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 basis-3/5 flex-col">
              <TopicEmbeddingMap
                key={facet.map.runId}
                query={scatter.query}
                topics={mapTopics}
                selectedTopic={null}
                matchingTraceIds={highlightedTraceIds}
                onSelectTopic={selectTopic}
                onSelectTrace={(traceId) => {
                  if (traceId) scatter.onOpenTrace(traceId);
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
          topicColors={
            scatter
              ? new Map(topics.map((topic) => [topic.id, topic.color]))
              : undefined
          }
          toolbar={
            search && (
              <TopicsTraceToolbar
                projectId={projectId}
                topics={searchTopics}
                filters={search.filters}
                onFiltersChange={search.setFilters}
                searchQuery={search.searchQuery}
                onSearchQueryChange={search.setSearchQuery}
              />
            )
          }
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
      <span aria-hidden className="bg-muted h-1 w-full rounded-full">
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
export function useScatterMapTopics(facet: Facet) {
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
