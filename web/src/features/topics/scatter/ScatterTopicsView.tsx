import { useMemo, type ComponentProps, type ReactNode } from "react";
import { useRouter } from "next/router";
import { type FilterState } from "@langfuse/shared";
import { useMediaQuery } from "react-responsive";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useDefaultLayout,
} from "@/src/components/ui/resizable";
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
import { filterTopicTraces, topicTraceQuery } from "../topic-trace-filters";
import { type useTopicTraceFilters } from "../useTopicTraceFilters";
import { ScatterMap } from "./ScatterMap";

/** The scatter above one-line topic rows, with the selected topic's traces beside them. */
export function ScatterTopicsView({
  projectId,
  facet,
  mapResult,
  traceFilters,
  showUnassigned,
  peekView,
  tracePanelRef,
  useTraces,
  onOpenTrace,
}: ScatterTopicsViewProps) {
  // A dot click opens its trace in the peek; the map keeps that dot's card open while the peek shows it.
  const router = useRouter();
  const peekTraceId =
    typeof router.query.peek === "string" ? router.query.peek : null;
  // The rows are the map's legend, so they take the scatter's colors.
  const topics = withScatterColors(
    prepareTopicDisplay(facet, "treemap").topics,
  );
  // A stable list keeps the highlight set, and so a pinned card, across selection re-renders.
  const searchTopics = useMemo(() => orderedFacetTopics(facet), [facet]);
  // The search bar holds the selection: picking a topic writes its filter there.
  const selectedTopicId = pickedTopicId(
    traceFilters.filters,
    traceFilters.searchQuery,
  );
  const selected = topics.find((topic) => topic.id === selectedTopicId);
  const isSearching =
    !selected &&
    (traceFilters.filters.length > 0 ||
      Boolean(traceFilters.searchQuery?.trim()));
  const traces = useTraces(listQuery());
  function listQuery(): TopicTraceQuery | null {
    if (isSearching)
      return topicTraceQuery(
        traceFilters.filters,
        traceFilters.searchQuery,
        searchTopics,
        { assignedOnly: !showUnassigned },
      );
    if (selected) return topicQuery(selected.id);
    return showUnassigned ? {} : { assigned: true };
  }
  // Picking a topic replaces the search with its filter; picking it again, or null, clears it.
  function selectTopic(topicId: string | null) {
    traceFilters.setSearchQuery(null);
    traceFilters.setFilters(
      topicId === null || topicId === selectedTopicId
        ? []
        : topicFilters(topicId),
    );
  }
  // Map resets (Fit, Escape, an empty click) drop a picked topic but keep a typed search.
  function clearPickedTopic() {
    if (selected) selectTopic(null);
  }
  function listTitle() {
    if (isSearching) return "Matching traces";
    return selected ? selected.name : "All traces";
  }
  function listCount() {
    // A search's total is unknown; the list only holds the loaded pages.
    if (isSearching) return null;
    return selected ? selected.count : facet.counts.total;
  }
  // Bars scale to the biggest real topic; Unassigned would flatten the rest.
  const maxCount = Math.max(
    1,
    ...topics
      .filter((topic) => topic.id !== UNASSIGNED_TOPIC_ID)
      .map((topic) => topic.count),
  );
  const isWide = useMediaQuery({ query: "(min-width: 1024px)" });
  const mapTopics = useScatterMapTopics(facet);
  const mapData = mapResult.data;
  const searchKey = JSON.stringify([
    traceFilters.filters,
    traceFilters.searchQuery,
  ]);
  const highlightedTraceIds = useMemo(() => {
    if (mapData?.status !== "ready") return undefined;
    // A search highlights its matches on the map; otherwise the picked topic does.
    if (isSearching) {
      const names = new Map(
        searchTopics.map((topic) => [topic.id, topic.name]),
      );
      const [filters, searchQuery] = JSON.parse(searchKey) as [
        typeof traceFilters.filters,
        string | null,
      ];
      return new Set(
        filterTopicTraces(
          mapData.points.map((point) => ({
            ...point,
            topicName: point.topicId
              ? (names.get(point.topicId) ?? null)
              : null,
          })),
          filters,
          searchQuery,
        ).map((point) => point.traceId),
      );
    }
    if (selectedTopicId === null) return undefined;
    const topicId =
      selectedTopicId === UNASSIGNED_TOPIC_ID ? null : selectedTopicId;
    return new Set(
      mapData.points
        .filter((point) => (point.topicId ?? null) === topicId)
        .map((point) => point.traceId),
    );
  }, [mapData, selectedTopicId, isSearching, searchKey, searchTopics]);
  // The map shows a selection only while it still matches, like the list.
  const mapSelectedTraceId =
    peekTraceId &&
    (!highlightedTraceIds || highlightedTraceIds.has(peekTraceId))
      ? peekTraceId
      : null;
  if (facet.topics.length === 0) {
    return <TopicsEmptyState />;
  }
  const rows = (
    <ul
      aria-label="Topics"
      className="scroll-fade-y flex min-h-0 flex-1 flex-col gap-px overflow-y-auto p-2"
    >
      {topics.map((topic) => (
        <li key={topic.id}>
          <TopicRow
            topic={topic}
            maxCount={maxCount}
            selected={topic.id === selected?.id}
            onSelect={() => selectTopic(topic.id)}
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
          <MapAndRowsSplit
            map={
              <ScatterMap
                key={facet.map.runId}
                query={mapResult}
                topics={mapTopics}
                selectedTopic={null}
                matchingTraceIds={highlightedTraceIds}
                onSelectTopic={(topicId) =>
                  topicId === null ? clearPickedTopic() : selectTopic(topicId)
                }
                onSelectTrace={(traceId) => {
                  if (!traceId) return clearPickedTopic();
                  if (document.fullscreenElement)
                    document.exitFullscreen().catch(() => undefined);
                  onOpenTrace(traceId);
                }}
                selectedTraceId={mapSelectedTraceId}
                pinSelection
                fillContainer
              />
            }
            rows={rows}
          />
        ) : (
          rows
        )
      }
      traces={
        <TopicTraceList
          key={isSearching ? "search" : (selected?.id ?? "all")}
          projectId={projectId}
          title={listTitle()}
          description={
            isSearching || !selected || selected.id === UNASSIGNED_TOPIC_ID
              ? undefined
              : selected.description
          }
          swatchColor={isSearching ? undefined : selected?.color}
          traces={traces}
          totalCount={listCount()}
          tracingTopic={
            isSearching || !selected || selected.id === UNASSIGNED_TOPIC_ID
              ? undefined
              : { facet, name: selected.name }
          }
          peekView={peekView}
          tracePanelRef={tracePanelRef}
          divider="none"
          emptyMessage={isSearching ? "No matches." : undefined}
          topicColors={new Map(topics.map((topic) => [topic.id, topic.color]))}
          search={{
            projectId,
            topics: searchTopics,
            filters: traceFilters.filters,
            onFiltersChange: traceFilters.setFilters,
            searchQuery: traceFilters.searchQuery,
            onSearchQueryChange: traceFilters.setSearchQuery,
          }}
        />
      }
    />
  );
}

type ScatterTopicsViewProps = {
  projectId: string;
  facet: Facet;
  mapResult: ComponentProps<typeof ScatterMap>["query"];
  /** The page's trace search and filters, shown above the trace list. */
  traceFilters: ReturnType<typeof useTopicTraceFilters>;
  /** Off hides unassigned traces from the search results too. */
  showUnassigned: boolean;
  peekView: DataTablePeekViewProps;
  tracePanelRef?: (element: HTMLElement | null) => void;
  useTraces: UseTopicTraces;
  onOpenTrace: (traceId: string) => void;
};

const MAP_AND_ROWS_PANEL_IDS = ["map", "rows"];

/** The map above the topic rows; the handle trades map height for more rows. */
function MapAndRowsSplit({ map, rows }: { map: ReactNode; rows: ReactNode }) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "topics-scatter-new-map-rows",
    panelIds: MAP_AND_ROWS_PANEL_IDS,
    storage: "local",
  });
  return (
    <ResizablePanelGroup
      orientation="vertical"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className="min-h-0 min-w-0 flex-1"
    >
      <ResizablePanel id="map" minSize="30%" className="flex flex-col">
        {map}
      </ResizablePanel>
      <ResizableHandle
        withHandle="hover"
        aria-label="Resize topic map and topics"
      />
      {/* Five rows and the top of the sixth, so the list reads as scrollable. */}
      <ResizablePanel
        id="rows"
        defaultSize="13rem"
        minSize="6rem"
        className="flex flex-col"
      >
        {rows}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

/** One line per topic, with a short bar beside the count. */
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
          className="block h-full rounded-full"
          style={{
            width: `${Math.min(1, topic.count / maxCount) * 100}%`,
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

/** Topics in the scatter colors, by rank; Unassigned stays grey. */
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

/** One topic picked in the list or on the map, as a search-bar filter. */
function topicFilters(topicId: string): FilterState {
  return topicId === UNASSIGNED_TOPIC_ID
    ? [
        {
          column: "assignment",
          type: "stringOptions",
          operator: "none of",
          value: ["assigned"],
        },
      ]
    : [
        {
          column: "topicId",
          type: "stringOptions",
          operator: "any of",
          value: [topicId],
        },
      ];
}

/** The topic the search bar holds when it is exactly one picked topic. */
function pickedTopicId(filters: FilterState, searchQuery: string | null) {
  if (searchQuery?.trim() || filters.length !== 1) return null;
  const [filter] = filters;
  if (filter?.type !== "stringOptions" || filter.value.length !== 1)
    return null;
  if (filter.column === "topicId" && filter.operator === "any of")
    return filter.value[0] ?? null;
  if (
    filter.column === "assignment" &&
    filter.operator === "none of" &&
    filter.value[0] === "assigned"
  )
    return UNASSIGNED_TOPIC_ID;
  return null;
}

function topicQuery(topicId: string): TopicTraceQuery {
  if (topicId === UNASSIGNED_TOPIC_ID) return { assigned: false };
  return { topicIds: { operator: "any of", values: [topicId] } };
}
