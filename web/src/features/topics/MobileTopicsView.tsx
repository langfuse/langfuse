import { useState, type ComponentProps, type ReactNode } from "react";
import { type FilterState } from "@langfuse/shared";
import { Button } from "@/src/components/design-system/Button/Button";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { type Facet, topicTracesHref } from "./facet-topics";
import { selectTopicTraceFilters } from "./topic-trace-filters";
import { TopicMobileList } from "./TopicMobileList";
import { TopicMobileTraceList } from "./TopicMobileTraceList";
import { MobileTopicVisualization } from "./MobileTopicVisualization";

import { prepareMobileTopics } from "./prepare-mobile-topics";
import { UNASSIGNED_TOPIC_ID } from "./prepare-topic-display";

type MobileTopicsViewProps = {
  projectId: string;
  facet: Facet;
  view: ComponentProps<typeof MobileTopicVisualization>["view"];
  mapResult: ComponentProps<typeof MobileTopicVisualization>["mapResult"];
  filters: FilterState;
  searchQuery: string | null;
  onFiltersChange: (filters: FilterState) => void;
  onSearchQueryChange: (query: string | null) => void;
  selectedTraceId: string | null;
  onSelectTrace: (traceId: string | null) => void;
  onOpenTrace: (traceId: string) => void;
  onGenerateTopics: () => void;
  canGenerateTopics: boolean;
  isV4: boolean;
  traceToolbar: ReactNode;
};

/** Local navigation only; query data and persisted filters stay with the caller. */
export function MobileTopicsView({
  projectId,
  facet,
  view,
  mapResult,
  filters,
  searchQuery,
  onFiltersChange,
  onSearchQueryChange,
  selectedTraceId,
  onSelectTrace,
  onOpenTrace,
  onGenerateTopics,
  canGenerateTopics,
  isV4,
  traceToolbar,
}: MobileTopicsViewProps) {
  const [navigation, setNavigation] = useState({
    view,
    panel: filters.length > 0 || searchQuery ? "traces" : "topics",
  });
  if (navigation.view !== view) {
    setNavigation({ view, panel: "visualization" });
  }
  function showPanel(panel: string) {
    setNavigation({ view, panel });
  }
  const { topics, selectedTopicId, selectedTopic, visible, matchingTraceIds } =
    prepareMobileTopics(facet, view, filters, searchQuery);
  const tracingHref = topicTracesHref(projectId, visible, isV4);

  function showAllTraces() {
    onFiltersChange([]);
    onSearchQueryChange(null);
    showPanel("traces");
  }
  function selectTopic(topicId: string | null) {
    if (topicId === null) {
      onFiltersChange([]);
      onSearchQueryChange(null);
      return;
    }
    onFiltersChange(
      topicId === UNASSIGNED_TOPIC_ID
        ? [
            {
              column: "assignment",
              type: "stringOptions",
              operator: "none of",
              value: ["assigned"],
            },
          ]
        : selectTopicTraceFilters([], topicId),
    );
    onSearchQueryChange(null);
    showPanel("traces");
  }
  function selectTrace(traceId: string | null) {
    if (traceId !== null && !matchingTraceIds.has(traceId)) {
      onFiltersChange([]);
      onSearchQueryChange(null);
    }
    onSelectTrace(traceId);
    if (traceId !== null) showPanel("traces");
  }
  function openTrace(traceId: string) {
    onSelectTrace(traceId);
    onOpenTrace(traceId);
  }

  return (
    <div className="ph-no-capture flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <Tabs value={navigation.panel} onValueChange={showPanel} layout="fill">
        <Tabs.List variant="underline" layout="full" aria-label="Topics panels">
          <Tabs.Trigger value="topics" label="Topics" />
          <Tabs.Trigger value="traces" label="Traces" />
          <Tabs.Trigger value="visualization" label="Visualize" />
        </Tabs.List>
        <Tabs.Content value="topics" layout="fill">
          <TopicMobileList
            topics={topics}
            totalCount={facet.rows.length}
            selectedTopicId={selectedTopicId}
            onSelectTopic={selectTopic}
            onShowAllTraces={showAllTraces}
          />
          {facet.topics.length === 0 && canGenerateTopics && (
            <div className="shrink-0 border-t p-3">
              <Button text="Generate topics" onClick={onGenerateTopics} />
            </div>
          )}
        </Tabs.Content>
        <Tabs.Content value="traces" layout="fill">
          <section
            aria-label="Topic traces"
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <TopicMobileTraceList
              key={facet.facetId}
              filterKey={JSON.stringify([filters, searchQuery])}
              rows={visible}
              selectedTraceId={selectedTraceId}
              onOpenTrace={openTrace}
            >
              <div className="shrink-0 border-b px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="min-w-0 flex-1 text-sm font-bold [overflow-wrap:anywhere]">
                    {selectedTopic?.name ?? "Trace summaries"}
                  </h3>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {visible.length.toLocaleString()} traces
                  </span>
                </div>
                {selectedTopic?.description && (
                  <p className="text-muted-foreground mt-1 line-clamp-3 text-sm [overflow-wrap:anywhere]">
                    {selectedTopic.description}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {(filters.length > 0 || searchQuery) && (
                    <Button
                      text="Show all traces"
                      variant="ghost"
                      size="sm"
                      onClick={showAllTraces}
                    />
                  )}
                  {tracingHref && (
                    <Button
                      text="Open in Tracing"
                      href={tracingHref}
                      variant="secondary"
                      size="sm"
                    />
                  )}
                </div>
              </div>
              {traceToolbar}
            </TopicMobileTraceList>
          </section>
        </Tabs.Content>
        <Tabs.Content value="visualization" layout="fill">
          <MobileTopicVisualization
            projectId={projectId}
            facet={facet}
            treemapTopics={topics}
            view={view}
            mapResult={mapResult}
            selectedTopicId={selectedTopicId}
            selectedTraceId={
              selectedTraceId && matchingTraceIds.has(selectedTraceId)
                ? selectedTraceId
                : null
            }
            matchingTraceIds={matchingTraceIds}
            onSelectTopic={selectTopic}
            onSelectTrace={selectTrace}
          />
        </Tabs.Content>
      </Tabs>
    </div>
  );
}
