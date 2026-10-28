import { type RouterOutputs } from "@/src/utils/api";
import { useMemo, useState } from "react";
import { type DataTablePeekViewProps } from "@/src/components/table/peek";
import { useElementSize } from "@/src/hooks/useElementSize";
import { TopicsEmptyState } from "./TopicsEmptyState";
import { type Facet, allTopicsLabel, orderedFacetTopics } from "./facet-topics";
import { prepareTopicGrid } from "./prepare-topic-grid";
import { TopicGrid } from "./TopicGrid";
import { TopicTraceList } from "./TopicTraceList";

type TopicGridViewProps = {
  projectId: string;
  facet: Facet;
  mapResult: {
    data?: RouterOutputs["topics"]["map"];
    error: { message: string } | null;
  };
  onOpenTrace: (traceId: string) => void;
  peekView: DataTablePeekViewProps;
  tracePanelRef?: (element: HTMLElement | null) => void;
  onGenerateTopics: () => void;
  canGenerateTopics: boolean;
};

type TopicGridContentProps = Omit<
  TopicGridViewProps,
  "onGenerateTopics" | "canGenerateTopics"
>;

function gridMessage(mapResult: TopicGridViewProps["mapResult"]) {
  if (mapResult.error) return `Grid could not load: ${mapResult.error.message}`;
  if (!mapResult.data) return "Loading grid…";
  if (mapResult.data.status !== "ready") {
    return (
      mapResult.data.reason ?? "This run has no saved embedding projection."
    );
  }
  return null;
}

export function TopicGridView({
  onGenerateTopics,
  canGenerateTopics,
  ...props
}: TopicGridViewProps) {
  if (orderedFacetTopics(props.facet).length === 0) {
    return (
      <TopicsEmptyState
        onGenerateTopics={onGenerateTopics}
        canGenerateTopics={canGenerateTopics}
      />
    );
  }
  return <TopicGridContent {...props} />;
}

/** Mounts once topics exist, so the trace list header is there to measure from the first render. */
function TopicGridContent({
  projectId,
  facet,
  mapResult,
  onOpenTrace,
  peekView,
  tracePanelRef,
}: TopicGridContentProps) {
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [headerRef, headerSize] = useElementSize<HTMLDivElement>();
  const { topics, points, perDot, rowsById } = useMemo(
    () => prepareTopicGrid(facet, mapResult.data),
    [facet, mapResult.data],
  );
  const selectedTopic =
    topics.find((topic) => topic.id === selectedTopicId) ?? null;
  const selectedId = selectedTopic?.id ?? null;
  // Stable per topic so the list keeps its loaded chunks across re-renders.
  const listRows = useMemo(
    () =>
      selectedId
        ? facet.rows.filter((row) => row.topicId === selectedId)
        : facet.rows,
    [facet.rows, selectedId],
  );
  const selectedIndex = selectedTopic
    ? topics.findIndex((topic) => topic.id === selectedTopic.id)
    : null;
  const message = facet.map
    ? gridMessage(mapResult)
    : "No map published for this facet.";

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col lg:flex-row">
      <section
        aria-label="Topic grid"
        className="flex min-h-48 min-w-0 shrink-0 basis-1/2 flex-col overflow-hidden lg:shrink lg:basis-3/5"
      >
        {message ? (
          <p className="text-muted-foreground p-4 text-sm">{message}</p>
        ) : (
          <TopicGrid
            points={points}
            perDot={perDot}
            topics={topics}
            rowsById={rowsById}
            selectedIndex={selectedIndex}
            onSelectTopic={setSelectedTopicId}
            onSelectTrace={onOpenTrace}
            barHeight={headerSize?.height}
          />
        )}
      </section>
      <TopicTraceList
        projectId={projectId}
        title={selectedTopic?.name ?? allTopicsLabel(facet.name)}
        description={selectedTopic?.description}
        swatchColor={
          selectedIndex !== null ? topics[selectedIndex]?.color : undefined
        }
        rows={listRows}
        peekView={peekView}
        tracePanelRef={tracePanelRef}
        headerRef={headerRef}
        divider="side"
      />
    </div>
  );
}
