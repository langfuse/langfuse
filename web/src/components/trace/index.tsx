import { type ObservationLevelType, type TraceDomain } from "@langfuse/shared";
import { TraceTree } from "./TraceTree";
import { ObservationPreview } from "./ObservationPreview";
import { TracePreview } from "./TracePreview";
import { TraceSettingsDropdown } from "./TraceSettingsDropdown";
import {
  StringParam,
  type UrlUpdateType,
  useQueryParam,
} from "use-query-params";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { api } from "@/src/utils/api";
import { castToNumberMap } from "@/src/utils/map-utils";
import useLocalStorage from "@/src/components/useLocalStorage";
import {
  Download,
  FoldVertical,
  UnfoldVertical,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useCallback, useState, useMemo, useRef, useEffect } from "react";
import { usePanelState } from "./hooks/usePanelState";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { TraceTimelineView } from "@/src/components/trace/TraceTimelineView";
import { type APIScoreV2, ObservationLevel } from "@langfuse/shared";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { TraceGraphView } from "@/src/features/trace-graph-view/components/TraceGraphView";
import { Command, CommandInput } from "@/src/components/ui/command";
import { TraceSearchList } from "@/src/components/trace/TraceSearchList";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import useSessionStorage from "@/src/components/useSessionStorage";
import { JsonExpansionProvider } from "@/src/components/trace/JsonExpansionContext";
import { buildTraceUiData } from "@/src/components/trace/lib/helpers";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
  type ImperativePanelHandle,
} from "@/src/components/ui/resizable";

const getNestedObservationKeys = (
  observations: ObservationReturnTypeWithMetadata[],
): string[] => {
  const keys: string[] = [];

  const collectKeys = (obs: ObservationReturnTypeWithMetadata[]) => {
    obs.forEach((observation) => {
      keys.push(`observation-${observation.id}`);
    });
  };

  collectKeys(observations);
  return keys;
};

export function Trace(props: {
  observations: Array<ObservationReturnTypeWithMetadata>;
  trace: Omit<TraceDomain, "input" | "output" | "metadata"> & {
    input: string | null;
    output: string | null;
    metadata: string | null;
  };
  scores: APIScoreV2[];
  projectId: string;
  viewType?: "detailed" | "focused";
  context?: "peek" | "fullscreen"; // are we in peek or fullscreen mode?
  isValidObservationId?: boolean;
  defaultMinObservationLevel?: ObservationLevelType;
  selectedTab?: string;
  setSelectedTab?: (
    newValue?: string | null,
    updateType?: UrlUpdateType,
  ) => void;
}) {
  const viewType = props.viewType ?? "detailed";
  const context = props.context ?? "fullscreen";
  const isValidObservationId = props.isValidObservationId ?? true;
  const capture = usePostHogClientCapture();
  const [currentObservationId, setCurrentObservationId] = useQueryParam(
    "observation",
    StringParam,
  );
  const [viewTab] = useQueryParam("view", StringParam);
  const [metricsOnObservationTree, setMetricsOnObservationTree] =
    useLocalStorage("metricsOnObservationTree", true);
  const [scoresOnObservationTree, setScoresOnObservationTree] = useLocalStorage(
    "scoresOnObservationTree",
    true,
  );
  const [
    colorCodeMetricsOnObservationTree,
    setColorCodeMetricsOnObservationTree,
  ] = useLocalStorage("colorCodeMetricsOnObservationTree", true);
  const [showComments, setShowComments] = useLocalStorage("showComments", true);
  const [showGraph, setShowGraph] = useLocalStorage("showGraph", true);
  const [collapsedNodes, setCollapsedNodes] = useState<string[]>([]);

  // Use imperative panel API for collapse/expand
  const treePanelRef = useRef<ImperativePanelHandle>(null);

  // TODO: remove, kinda hacky
  // when user clicks Log View, we want to show them that you can collapse the tree panel
  const [shouldPulseToggle, setShouldPulseToggle] = useState(false);
  useEffect(() => {
    if (viewTab === "log") {
      setShouldPulseToggle(true);
      const timeout = setTimeout(() => {
        setShouldPulseToggle(false);
      }, 2000); // Pulse for 2 seconds
      return () => clearTimeout(timeout);
    }
  }, [viewTab]);

  // initial panel sizes for graph resizing
  const [timelineGraphSizes, setTimelineGraphSizes] = useLocalStorage(
    "trace-detail-timeline-graph-vertical",
    [60, 40],
  );
  const [treeGraphSizes, setTreeGraphSizes] = useLocalStorage(
    "trace-detail-tree-graph-vertical",
    [60, 40],
  );

  const [minObservationLevel, setMinObservationLevel] =
    useState<ObservationLevelType>(
      props.defaultMinObservationLevel ?? ObservationLevel.DEFAULT,
    );

  const containerRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const panelGroupId = `trace-panel-group-${context}`;
  const panelState = usePanelState(
    panelGroupId,
    props.selectedTab?.includes("timeline") ? "timeline" : "tree",
  );

  const TREE_DEFAULT_WIDTH = 30;

  // Derive collapsed state from actual panel size (single source of truth = autoSaveId)
  // This avoids cross-tab sync issues from storing collapsed state separately
  const [isTreePanelCollapsed, setIsTreePanelCollapsed] = useState(false);

  // Sync initial collapsed state from actual panel size on mount
  useEffect(() => {
    if (treePanelRef.current) {
      const currentSize = treePanelRef.current.getSize();
      const collapsed = currentSize <= 5;
      if (collapsed !== isTreePanelCollapsed) {
        setIsTreePanelCollapsed(collapsed);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAuthenticatedAndProjectMember = useIsAuthenticatedAndProjectMember(
    props.projectId,
  );

  const observationCommentCounts = api.comments.getCountByObjectType.useQuery(
    {
      projectId: props.trace.projectId,
      objectType: "OBSERVATION",
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false, // prevents refetching loops
      enabled: isAuthenticatedAndProjectMember,
    },
  );

  const traceCommentCounts = api.comments.getCountByObjectId.useQuery(
    {
      projectId: props.trace.projectId,
      objectId: props.trace.id,
      objectType: "TRACE",
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false, // prevents refetching loops
      enabled: isAuthenticatedAndProjectMember,
    },
  );

  const observationStartTimes = props.observations.map((o) =>
    o.startTime.getTime(),
  );
  const minStartTime = new Date(
    Math.min(...observationStartTimes, Date.now()), // the Date now is a guard for empty obs list
  ).toISOString();
  const maxStartTime = new Date(
    Math.max(...observationStartTimes, 0), // the zero is a guard for empty obs list
  ).toISOString();

  const agentGraphDataQuery = api.traces.getAgentGraphData.useQuery(
    {
      projectId: props.trace.projectId,
      traceId: props.trace.id,
      minStartTime,
      maxStartTime,
    },
    {
      enabled: props.observations.length > 0,
    },
  );

  const agentGraphData = useMemo(() => {
    return agentGraphDataQuery.data ?? [];
  }, [agentGraphDataQuery.data]);

  const isGraphViewAvailable = useMemo(() => {
    if (agentGraphData.length === 0) {
      return false;
    }

    // don't show graph UI at all for extremely large traces
    const MAX_NODES_FOR_GRAPH_UI = 5000;
    if (agentGraphData.length >= MAX_NODES_FOR_GRAPH_UI) {
      return false;
    }

    // Check if there are observations that would be included in the graph (not SPAN, EVENT, or GENERATION)
    const hasGraphableObservations = agentGraphData.some((obs) => {
      return (
        obs.observationType !== "SPAN" &&
        obs.observationType !== "EVENT" &&
        obs.observationType !== "GENERATION"
      );
    });

    const hasLangGraphData = agentGraphData.some(
      (obs) => obs.step != null && obs.step !== 0,
    );

    return hasGraphableObservations || hasLangGraphData;
  }, [agentGraphData]);

  const toggleCollapsedNode = useCallback((id: string) => {
    setCollapsedNodes((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  }, []);

  const expandAll = useCallback(() => {
    capture("trace_detail:observation_tree_expand", { type: "all" });
    setCollapsedNodes([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const downloadTraceAsJson = useCallback(() => {
    const exportData = {
      trace: props.trace,
      observations: props.observations,
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `trace-${props.trace.id}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    capture("trace_detail:download_button_click");
  }, [props.trace, props.observations, capture]);

  const [expandedItems, setExpandedItems] = useSessionStorage<string[]>(
    `${props.trace.id}-expanded`,
    [
      `trace-${props.trace.id}`,
      ...getNestedObservationKeys(props.observations),
    ],
  );

  // Build UI data once
  const {
    tree: traceTree,
    hiddenObservationsCount,
    searchItems,
  } = useMemo(
    () =>
      buildTraceUiData(props.trace, props.observations, minObservationLevel),
    [props.trace, props.observations, minObservationLevel],
  );

  // Compute these outside the component to avoid recreation
  const hasQuery = (searchQuery ?? "").trim().length > 0;
  const commentsMap = new Map(
    [
      ...(observationCommentCounts.data
        ? Array.from(observationCommentCounts.data.entries())
        : []),
      ...(traceCommentCounts.data
        ? [
            [
              `trace-${props.trace.id}`,
              traceCommentCounts.data.get(props.trace.id),
            ],
          ]
        : []),
    ].filter(([, count]) => count !== undefined) as [string, number][],
  );

  const treeOrSearchContent = hasQuery ? (
    <TraceSearchList
      items={searchItems}
      scores={props.scores}
      onSelect={setCurrentObservationId}
      comments={commentsMap}
      showMetrics={metricsOnObservationTree}
      showScores={scoresOnObservationTree}
      colorCodeMetrics={colorCodeMetricsOnObservationTree}
      showComments={showComments}
      onClearSearch={() => setSearchQuery("")}
    />
  ) : (
    <TraceTree
      tree={traceTree}
      collapsedNodes={collapsedNodes}
      toggleCollapsedNode={toggleCollapsedNode}
      scores={props.scores}
      currentNodeId={currentObservationId ?? undefined}
      setCurrentNodeId={setCurrentObservationId}
      showMetrics={metricsOnObservationTree}
      showScores={scoresOnObservationTree}
      showComments={showComments}
      colorCodeMetrics={colorCodeMetricsOnObservationTree}
      nodeCommentCounts={commentsMap}
      hiddenObservationsCount={hiddenObservationsCount}
      minLevel={minObservationLevel}
      setMinLevel={setMinObservationLevel}
    />
  );

  const previewContent =
    currentObservationId === undefined ||
    currentObservationId === "" ||
    currentObservationId === null ||
    viewTab === "log" ? (
      <TracePreview
        trace={props.trace}
        observations={props.observations}
        scores={props.scores}
        commentCounts={castToNumberMap(traceCommentCounts.data)}
        viewType={viewType}
      />
    ) : isValidObservationId ? (
      <ObservationPreview
        observations={props.observations}
        scores={props.scores}
        projectId={props.projectId}
        currentObservationId={currentObservationId}
        traceId={props.trace.id}
        commentCounts={castToNumberMap(observationCommentCounts.data)}
        viewType={viewType}
        isTimeline={props.selectedTab?.includes("timeline")}
      />
    ) : null;

  return (
    <JsonExpansionProvider>
      <div
        ref={containerRef}
        className="relative flex-1 md:h-full md:min-w-[600px]"
      >
        {/* Mobile: Vertical stack without resizing */}
        <div className="flex h-full w-full flex-col overflow-y-auto md:hidden">
          {/* Tree Panel - Mobile */}
          <div className="flex-shrink-0 border-b pb-4">
            <Command className="mt-2 flex flex-col gap-2 overflow-hidden rounded-none border-0">
              <div className="flex flex-row justify-between px-3 pl-5">
                {props.selectedTab?.includes("timeline") ? (
                  <span className="whitespace-nowrap px-1 py-2 text-sm text-muted-foreground">
                    Node display
                  </span>
                ) : (
                  <CommandInput
                    showBorder={false}
                    placeholder="Search"
                    className="-ml-2 h-9 min-w-20 border-0 focus:ring-0"
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                  />
                )}
                {viewType === "detailed" && (
                  <div className="flex flex-row items-center gap-2">
                    {/* Expand/Collapse All Button */}
                    {props.selectedTab?.includes("timeline") ? (
                      <Button
                        onClick={() => {
                          const isTraceExpanded = expandedItems.includes(
                            `trace-${props.trace.id}`,
                          );
                          if (isTraceExpanded) {
                            setExpandedItems([]);
                          } else {
                            setExpandedItems([
                              `trace-${props.trace.id}`,
                              ...getNestedObservationKeys(props.observations),
                            ]);
                          }
                        }}
                        variant="ghost"
                        size="icon"
                        title={
                          expandedItems.includes(`trace-${props.trace.id}`)
                            ? "Collapse all"
                            : "Expand all"
                        }
                      >
                        {expandedItems.includes(`trace-${props.trace.id}`) ? (
                          <FoldVertical className="h-4 w-4" />
                        ) : (
                          <UnfoldVertical className="h-4 w-4" />
                        )}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => {
                          const traceRootId = `trace-${props.trace.id}`;
                          const isEverythingCollapsed =
                            collapsedNodes.includes(traceRootId);
                          if (isEverythingCollapsed) {
                            expandAll();
                          } else {
                            const allObservationIds = props.observations.map(
                              (o) => o.id,
                            );
                            setCollapsedNodes([
                              ...allObservationIds,
                              traceRootId,
                            ]);
                          }
                        }}
                        variant="ghost"
                        size="icon"
                        title={
                          collapsedNodes.includes(`trace-${props.trace.id}`)
                            ? "Expand all"
                            : "Collapse all"
                        }
                      >
                        {collapsedNodes.includes(`trace-${props.trace.id}`) ? (
                          <UnfoldVertical className="h-4 w-4" />
                        ) : (
                          <FoldVertical className="h-4 w-4" />
                        )}
                      </Button>
                    )}

                    {/* Settings Dropdown */}
                    <TraceSettingsDropdown
                      isGraphViewAvailable={isGraphViewAvailable}
                      showGraph={showGraph}
                      setShowGraph={setShowGraph}
                      showComments={showComments}
                      setShowComments={setShowComments}
                      scoresOnObservationTree={scoresOnObservationTree}
                      setScoresOnObservationTree={setScoresOnObservationTree}
                      metricsOnObservationTree={metricsOnObservationTree}
                      setMetricsOnObservationTree={setMetricsOnObservationTree}
                      colorCodeMetricsOnObservationTree={
                        colorCodeMetricsOnObservationTree
                      }
                      setColorCodeMetricsOnObservationTree={
                        setColorCodeMetricsOnObservationTree
                      }
                      minObservationLevel={minObservationLevel}
                      setMinObservationLevel={setMinObservationLevel}
                    />

                    {/* Download Button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={downloadTraceAsJson}
                      title="Download trace as JSON"
                    >
                      <Download className="h-4 w-4" />
                    </Button>

                    {/* Timeline Toggle Button */}
                    <Button
                      variant={
                        props.selectedTab?.includes("timeline")
                          ? "default"
                          : "ghost"
                      }
                      size="sm"
                      onClick={() =>
                        props.setSelectedTab?.(
                          props.selectedTab?.includes("timeline")
                            ? "preview"
                            : "timeline",
                          "replaceIn",
                        )
                      }
                      className={cn(
                        props.selectedTab?.includes("timeline") &&
                          "bg-primary text-primary-foreground",
                      )}
                    >
                      <span className="text-sm">Timeline</span>
                    </Button>
                    {/* Note: No panel collapse button on mobile */}
                  </div>
                )}
              </div>
              <div className="px-2">
                {props.selectedTab?.includes("timeline") ? (
                  <div className="w-full">
                    <TraceTimelineView
                      key={props.trace.id}
                      trace={props.trace}
                      scores={props.scores}
                      observations={props.observations}
                      projectId={props.trace.projectId}
                      currentObservationId={currentObservationId ?? null}
                      setCurrentObservationId={setCurrentObservationId}
                      expandedItems={expandedItems}
                      setExpandedItems={setExpandedItems}
                      showMetrics={metricsOnObservationTree}
                      showScores={scoresOnObservationTree}
                      showComments={showComments}
                      colorCodeMetrics={colorCodeMetricsOnObservationTree}
                      minLevel={minObservationLevel}
                      setMinLevel={setMinObservationLevel}
                    />
                  </div>
                ) : (
                  <div className="w-full">{treeOrSearchContent}</div>
                )}
              </div>
            </Command>
          </div>

          {/* Preview Panel - Mobile */}
          <div className="flex-1 pt-4">
            <div className="h-full pl-3">{previewContent}</div>
          </div>
        </div>

        {/* Desktop: Horizontal resizable panels */}
        <div className="hidden md:block md:h-full">
          <ResizablePanelGroup
            id={panelGroupId}
            direction="horizontal"
            className="flex-1 md:h-full"
            autoSaveId={
              context === "peek"
                ? "trace-layout-peek"
                : "trace-layout-fullscreen"
            }
          >
            <ResizablePanel
              ref={treePanelRef}
              id="trace-tree-panel"
              order={1}
              defaultSize={TREE_DEFAULT_WIDTH}
              minSize={panelState.minSize}
              maxSize={panelState.maxSize}
              collapsible={true}
              collapsedSize={3}
              onResize={(size) => {
                // Derive collapsed state from actual panel size
                const collapsed = size <= 5;
                if (collapsed !== isTreePanelCollapsed) {
                  setIsTreePanelCollapsed(collapsed);
                }
              }}
              className="md:flex md:h-full md:flex-col md:overflow-hidden"
            >
              {isTreePanelCollapsed ? (
                <div className="flex h-full w-full items-start justify-center border-r pt-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      // Use minSize as the smallest legal value we can expand to
                      treePanelRef.current?.resize(panelState.minSize);
                      capture("trace_detail:tree_panel_toggle", {
                        collapsed: false,
                      });
                    }}
                    title="Show trace tree"
                    className={cn(
                      "h-10 w-10",
                      shouldPulseToggle && "animate-pulse",
                    )}
                  >
                    <PanelLeftOpen className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Command className="mt-2 flex h-full flex-col gap-2 overflow-hidden rounded-none border-0">
                  <div className="flex flex-row justify-between px-3 pl-5">
                    {props.selectedTab?.includes("timeline") ? (
                      <span className="whitespace-nowrap px-1 py-2 text-sm text-muted-foreground">
                        Node display
                      </span>
                    ) : (
                      <CommandInput
                        showBorder={false}
                        placeholder="Search"
                        className="-ml-2 h-9 min-w-20 border-0 focus:ring-0"
                        value={searchQuery}
                        onValueChange={setSearchQuery}
                      />
                    )}
                    {viewType === "detailed" && (
                      <div className="flex flex-row items-center gap-2">
                        {props.selectedTab?.includes("timeline") ? (
                          <Button
                            onClick={() => {
                              // Check if trace is expanded (top level element)
                              const isTraceExpanded = expandedItems.includes(
                                `trace-${props.trace.id}`,
                              );
                              if (isTraceExpanded) {
                                setExpandedItems([]);
                              } else {
                                setExpandedItems([
                                  `trace-${props.trace.id}`,
                                  ...getNestedObservationKeys(
                                    props.observations,
                                  ),
                                ]);
                              }
                            }}
                            variant="ghost"
                            size="icon"
                            title={
                              expandedItems.includes(`trace-${props.trace.id}`)
                                ? "Collapse all"
                                : "Expand all"
                            }
                          >
                            {expandedItems.includes(
                              `trace-${props.trace.id}`,
                            ) ? (
                              <FoldVertical className="h-4 w-4" />
                            ) : (
                              <UnfoldVertical className="h-4 w-4" />
                            )}
                          </Button>
                        ) : (
                          (() => {
                            // Use the same root id format as the tree (see buildTraceUiData)
                            const traceRootId = `trace-${props.trace.id}`;
                            // Check if everything is collapsed by seeing if the trace root is collapsed
                            const isEverythingCollapsed =
                              collapsedNodes.includes(traceRootId);

                            return (
                              <Button
                                onClick={() => {
                                  if (isEverythingCollapsed) {
                                    expandAll();
                                  } else {
                                    // Collapse all observations AND the trace root
                                    const allObservationIds =
                                      props.observations.map((o) => o.id);
                                    setCollapsedNodes([
                                      ...allObservationIds,
                                      traceRootId,
                                    ]);
                                  }
                                }}
                                variant="ghost"
                                size="icon"
                                title={
                                  isEverythingCollapsed
                                    ? "Expand all"
                                    : "Collapse all"
                                }
                              >
                                {isEverythingCollapsed ? (
                                  <UnfoldVertical className="h-4 w-4" />
                                ) : (
                                  <FoldVertical className="h-4 w-4" />
                                )}
                              </Button>
                            );
                          })()
                        )}
                        <TraceSettingsDropdown
                          isGraphViewAvailable={isGraphViewAvailable}
                          showGraph={showGraph}
                          setShowGraph={setShowGraph}
                          showComments={showComments}
                          setShowComments={setShowComments}
                          scoresOnObservationTree={scoresOnObservationTree}
                          setScoresOnObservationTree={
                            setScoresOnObservationTree
                          }
                          metricsOnObservationTree={metricsOnObservationTree}
                          setMetricsOnObservationTree={
                            setMetricsOnObservationTree
                          }
                          colorCodeMetricsOnObservationTree={
                            colorCodeMetricsOnObservationTree
                          }
                          setColorCodeMetricsOnObservationTree={
                            setColorCodeMetricsOnObservationTree
                          }
                          minObservationLevel={minObservationLevel}
                          setMinObservationLevel={setMinObservationLevel}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={downloadTraceAsJson}
                          title="Download trace as JSON"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant={
                            props.selectedTab?.includes("timeline")
                              ? "default"
                              : "ghost"
                          }
                          size="sm"
                          onClick={() =>
                            props.setSelectedTab?.(
                              props.selectedTab?.includes("timeline")
                                ? "preview"
                                : "timeline",
                              "replaceIn",
                            )
                          }
                          className={cn(
                            props.selectedTab?.includes("timeline") &&
                              "bg-primary text-primary-foreground",
                          )}
                        >
                          <span className="text-sm">Timeline</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (isTreePanelCollapsed) {
                              treePanelRef.current?.resize(panelState.minSize);
                            } else {
                              treePanelRef.current?.collapse();
                            }
                            capture("trace_detail:tree_panel_toggle", {
                              collapsed: !isTreePanelCollapsed,
                            });
                          }}
                          title={
                            isTreePanelCollapsed
                              ? "Show trace tree"
                              : "Hide trace tree"
                          }
                          className={cn(shouldPulseToggle && "animate-pulse")}
                        >
                          {isTreePanelCollapsed ? (
                            <PanelLeftOpen className="h-4 w-4" />
                          ) : (
                            <PanelLeftClose className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="h-full overflow-hidden">
                    {props.selectedTab?.includes("timeline") ? (
                      <div className="h-full w-full flex-1 flex-col overflow-hidden">
                        {isGraphViewAvailable && showGraph ? (
                          <ResizablePanelGroup
                            direction="vertical"
                            className="flex h-full w-full flex-col overflow-hidden"
                            onLayout={setTimelineGraphSizes}
                          >
                            <ResizablePanel
                              defaultSize={timelineGraphSizes[0]}
                              minSize={5}
                              maxSize={95}
                              className="overflow-y-auto overflow-x-hidden"
                            >
                              <TraceTimelineView
                                key={`timeline-${props.trace.id}`}
                                trace={props.trace}
                                scores={props.scores}
                                observations={props.observations}
                                projectId={props.trace.projectId}
                                currentObservationId={
                                  currentObservationId ?? null
                                }
                                setCurrentObservationId={
                                  setCurrentObservationId
                                }
                                expandedItems={expandedItems}
                                setExpandedItems={setExpandedItems}
                                showMetrics={metricsOnObservationTree}
                                showScores={scoresOnObservationTree}
                                showComments={showComments}
                                colorCodeMetrics={
                                  colorCodeMetricsOnObservationTree
                                }
                                minLevel={minObservationLevel}
                                setMinLevel={setMinObservationLevel}
                              />
                            </ResizablePanel>

                            <ResizableHandle className="relative h-px bg-border transition-colors duration-200 after:absolute after:inset-x-0 after:top-0 after:h-1 after:-translate-y-px after:bg-blue-200 after:opacity-0 after:transition-opacity after:duration-200 hover:after:opacity-100 data-[resize-handle-state='drag']:after:opacity-100" />

                            <ResizablePanel
                              defaultSize={timelineGraphSizes[1]}
                              minSize={5}
                              maxSize={95}
                              className="overflow-hidden"
                            >
                              <TraceGraphView
                                key={`graph-timeline-${props.trace.id}`}
                                agentGraphData={agentGraphData}
                              />
                            </ResizablePanel>
                          </ResizablePanelGroup>
                        ) : (
                          <div className="flex h-full w-full overflow-y-auto overflow-x-hidden">
                            <TraceTimelineView
                              key={props.trace.id}
                              trace={props.trace}
                              scores={props.scores}
                              observations={props.observations}
                              projectId={props.trace.projectId}
                              currentObservationId={
                                currentObservationId ?? null
                              }
                              setCurrentObservationId={setCurrentObservationId}
                              expandedItems={expandedItems}
                              setExpandedItems={setExpandedItems}
                              showMetrics={metricsOnObservationTree}
                              showScores={scoresOnObservationTree}
                              showComments={showComments}
                              colorCodeMetrics={
                                colorCodeMetricsOnObservationTree
                              }
                              minLevel={minObservationLevel}
                              setMinLevel={setMinObservationLevel}
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex h-full w-full flex-col overflow-hidden">
                        {isGraphViewAvailable && showGraph ? (
                          <ResizablePanelGroup
                            direction="vertical"
                            className="flex h-full w-full flex-col overflow-hidden"
                            onLayout={setTreeGraphSizes}
                          >
                            <ResizablePanel
                              defaultSize={treeGraphSizes[0]}
                              minSize={5}
                              maxSize={95}
                              className="flex flex-col overflow-hidden px-2"
                            >
                              <div className="min-h-0 flex-1 overflow-y-auto pb-2">
                                {treeOrSearchContent}
                              </div>
                            </ResizablePanel>

                            <ResizableHandle className="relative h-px bg-border transition-colors duration-200 after:absolute after:inset-x-0 after:top-0 after:h-1 after:-translate-y-px after:bg-blue-200 after:opacity-0 after:transition-opacity after:duration-200 hover:after:opacity-100 data-[resize-handle-state='drag']:after:opacity-100" />

                            <ResizablePanel
                              defaultSize={treeGraphSizes[1]}
                              minSize={5}
                              maxSize={95}
                              className="overflow-hidden"
                            >
                              <TraceGraphView
                                key={`graph-tree-${props.trace.id}`}
                                agentGraphData={agentGraphData}
                              />
                            </ResizablePanel>
                          </ResizablePanelGroup>
                        ) : (
                          <div className="flex h-full w-full flex-col overflow-hidden px-2">
                            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
                              {treeOrSearchContent}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Command>
              )}
            </ResizablePanel>

            <ResizableHandle className="relative w-px bg-border transition-colors duration-200 after:absolute after:inset-y-0 after:left-0 after:w-1 after:-translate-x-px after:bg-blue-200 after:opacity-0 after:transition-opacity after:duration-200 hover:after:opacity-100 data-[resize-handle-state='drag']:after:opacity-100" />

            <ResizablePanel
              id="trace-preview-panel"
              order={2}
              defaultSize={70}
              className="min-w-56 overflow-hidden md:h-full"
            >
              <div className="h-full pl-3">{previewContent}</div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </JsonExpansionProvider>
  );
}
