import { type ObservationLevelType, type TraceDomain } from "@langfuse/shared";
import { TraceTree } from "./TraceTree";
import { ObservationPreview } from "./ObservationPreview";
import { TracePreview } from "./TracePreview";
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
  Settings2,
  Download,
  FoldVertical,
  UnfoldVertical,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useCallback, useState, useMemo, useRef } from "react";
import { usePanelState } from "./hooks/usePanelState";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { TraceTimelineView } from "@/src/components/trace/TraceTimelineView";
import { type APIScoreV2, ObservationLevel } from "@langfuse/shared";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { TraceGraphView } from "@/src/features/trace-graph-view/components/TraceGraphView";
import { Command, CommandInput } from "@/src/components/ui/command";
import { TraceSearchList } from "@/src/components/trace/TraceSearchList";
import { Switch } from "@/src/components/ui/switch";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuLabel,
} from "@/src/components/ui/dropdown-menu";
import { cn } from "@/src/utils/tailwind";
import useSessionStorage from "@/src/components/useSessionStorage";
import { JsonExpansionProvider } from "@/src/components/trace/JsonExpansionContext";
import { buildTraceUiData } from "@/src/components/trace/lib/helpers";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
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
  isValidObservationId?: boolean;
  defaultMinObservationLevel?: ObservationLevelType;
  selectedTab?: string;
  setSelectedTab?: (
    newValue?: string | null,
    updateType?: UrlUpdateType,
  ) => void;
}) {
  const viewType = props.viewType ?? "detailed";
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
  const [isTreePanelCollapsed, setIsTreePanelCollapsed] = useLocalStorage(
    "traceTreePanelCollapsed",
    false,
  );
  const [collapsedNodes, setCollapsedNodes] = useState<string[]>([]);

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

  const panelState = usePanelState(
    containerRef,
    props.selectedTab?.includes("timeline") ? "timeline" : "tree",
  );

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

  return (
    <JsonExpansionProvider>
      <div
        ref={containerRef}
        className="relative flex-1 md:h-full"
        style={{ minWidth: "600px" }}
      >
        <ResizablePanelGroup
          direction="horizontal"
          className="flex-1 md:h-full"
          onLayout={panelState.onLayout}
        >
          <ResizablePanel
            defaultSize={isTreePanelCollapsed ? 3 : panelState.sizes[0]}
            minSize={isTreePanelCollapsed ? 3 : panelState.minSize}
            maxSize={isTreePanelCollapsed ? 3 : panelState.maxSize}
            className="md:flex md:h-full md:flex-col md:overflow-hidden"
          >
            {isTreePanelCollapsed ? (
              <div className="flex h-full items-start justify-center border-r pt-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setIsTreePanelCollapsed(false);
                    capture("trace_detail:tree_panel_toggle", {
                      collapsed: false,
                    });
                  }}
                  title="Show trace tree"
                  className="h-10 w-10"
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="View Options"
                          >
                            <Settings2 className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel>View Options</DropdownMenuLabel>
                          <DropdownMenuSeparator />

                          {isGraphViewAvailable && (
                            <div className="p-1">
                              <DropdownMenuItem
                                asChild
                                onSelect={(e) => e.preventDefault()}
                              >
                                <div className="flex w-full items-center justify-between">
                                  <span className="mr-2">Show Graph</span>
                                  <Switch
                                    checked={showGraph}
                                    onCheckedChange={(e) => setShowGraph(e)}
                                  />
                                </div>
                              </DropdownMenuItem>
                            </div>
                          )}

                          <div className="space-y-1 p-1">
                            <DropdownMenuItem
                              asChild
                              onSelect={(e) => e.preventDefault()}
                            >
                              <div className="flex w-full items-center justify-between">
                                <span className="mr-2">Show Comments</span>
                                <Switch
                                  checked={showComments}
                                  onCheckedChange={(e) => {
                                    setShowComments(e);
                                  }}
                                />
                              </div>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              asChild
                              onSelect={(e) => e.preventDefault()}
                            >
                              <div className="flex w-full items-center justify-between">
                                <span className="mr-2">Show Scores</span>
                                <Switch
                                  checked={scoresOnObservationTree}
                                  onCheckedChange={(e) => {
                                    capture(
                                      "trace_detail:observation_tree_toggle_scores",
                                      {
                                        show: e,
                                      },
                                    );
                                    setScoresOnObservationTree(e);
                                  }}
                                />
                              </div>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              asChild
                              onSelect={(e) => e.preventDefault()}
                            >
                              <div className="flex w-full items-center justify-between">
                                <span className="mr-2">Show Metrics</span>
                                <Switch
                                  checked={metricsOnObservationTree}
                                  onCheckedChange={(e) => {
                                    capture(
                                      "trace_detail:observation_tree_toggle_metrics",
                                      {
                                        show: e,
                                      },
                                    );
                                    setMetricsOnObservationTree(e);
                                  }}
                                />
                              </div>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              asChild
                              onSelect={(e) => e.preventDefault()}
                              disabled={!metricsOnObservationTree}
                              className={cn(
                                !metricsOnObservationTree &&
                                  "cursor-not-allowed",
                              )}
                            >
                              <div
                                className={cn(
                                  "flex w-full items-center justify-between",
                                  !metricsOnObservationTree &&
                                    "cursor-not-allowed",
                                )}
                              >
                                <span
                                  className={cn(
                                    "mr-2",
                                    !metricsOnObservationTree &&
                                      "cursor-not-allowed",
                                  )}
                                >
                                  Color Code Metrics
                                </span>
                                <Switch
                                  checked={colorCodeMetricsOnObservationTree}
                                  onCheckedChange={(e) =>
                                    setColorCodeMetricsOnObservationTree(e)
                                  }
                                  disabled={!metricsOnObservationTree}
                                  className={cn(
                                    !metricsOnObservationTree &&
                                      "cursor-not-allowed",
                                  )}
                                />
                              </div>
                            </DropdownMenuItem>
                          </div>

                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <span className="flex items-center">
                                Min Level: {minObservationLevel}
                              </span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              <DropdownMenuLabel className="font-semibold">
                                Minimum Level
                              </DropdownMenuLabel>
                              {Object.values(ObservationLevel).map((level) => (
                                <DropdownMenuItem
                                  key={level}
                                  onSelect={(e) => {
                                    e.preventDefault();
                                    setMinObservationLevel(level);
                                  }}
                                >
                                  {level}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
                          const newCollapsedState = !isTreePanelCollapsed;
                          setIsTreePanelCollapsed(newCollapsedState);
                          capture("trace_detail:tree_panel_toggle", {
                            collapsed: newCollapsedState,
                          });
                        }}
                        title={
                          isTreePanelCollapsed
                            ? "Show trace tree"
                            : "Hide trace tree"
                        }
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

          <ResizablePanel className="min-w-56 overflow-hidden md:h-full">
            <div className="h-full pl-3">
              {currentObservationId === undefined ||
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
              ) : null}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </JsonExpansionProvider>
  );
}
