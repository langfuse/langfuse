import { type ObservationLevelType, type TraceDomain } from "@langfuse/shared";
import { ObservationTree } from "./ObservationTree";
import { ObservationPreview } from "./ObservationPreview";
import { TracePreview } from "./TracePreview";
import {
  StringParam,
  type UrlUpdateType,
  useQueryParam,
} from "use-query-params";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { api } from "@/src/utils/api";
import useLocalStorage from "@/src/components/useLocalStorage";
import {
  Settings2,
  ChevronsUpDown,
  ChevronsDownUp,
  Download,
} from "lucide-react";
import { useCallback, useState } from "react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { TraceTimelineView } from "@/src/components/trace/TraceTimelineView";
import { type APIScoreV2, ObservationLevel } from "@langfuse/shared";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { TraceGraphView } from "@/src/features/trace-graph-view/components/TraceGraphView";
import { Command, CommandInput } from "@/src/components/ui/command";
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
  DropdownMenuGroup,
} from "@/src/components/ui/dropdown-menu";
import { cn } from "@/src/utils/tailwind";
import useSessionStorage from "@/src/components/useSessionStorage";

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
  const [collapsedObservations, setCollapsedObservations] = useState<string[]>(
    [],
  );

  const [minObservationLevel, setMinObservationLevel] =
    useState<ObservationLevelType>(
      props.defaultMinObservationLevel ?? ObservationLevel.DEFAULT,
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

  const agentGraphData = agentGraphDataQuery.data ?? [];
  const isGraphViewAvailable = agentGraphData.length > 0;

  const toggleCollapsedObservation = useCallback(
    (id: string) => {
      if (collapsedObservations.includes(id)) {
        setCollapsedObservations(collapsedObservations.filter((i) => i !== id));
      } else {
        setCollapsedObservations([...collapsedObservations, id]);
      }
    },
    [collapsedObservations],
  );

  const collapseAll = useCallback(() => {
    // exclude all parents of the current observation
    let excludeParentObservations = new Set<string>();
    let newExcludeParentObservations = new Set<string>();
    do {
      excludeParentObservations = new Set<string>([
        ...excludeParentObservations,
        ...newExcludeParentObservations,
      ]);
      newExcludeParentObservations = new Set<string>(
        props.observations
          .filter(
            (o) =>
              o.parentObservationId !== null &&
              (o.id === currentObservationId ||
                excludeParentObservations.has(o.id)),
          )
          .map((o) => o.parentObservationId as string)
          .filter((id) => !excludeParentObservations.has(id)),
      );
    } while (newExcludeParentObservations.size > 0);
    capture("trace_detail:observation_tree_collapse", { type: "all" });
    setCollapsedObservations(
      props.observations
        .map((o) => o.id)
        .filter((id) => !excludeParentObservations.has(id)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.observations, currentObservationId]);

  const expandAll = useCallback(() => {
    capture("trace_detail:observation_tree_expand", { type: "all" });
    setCollapsedObservations([]);
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
    [`trace-${props.trace.id}`],
  );

  return (
    <div
      className={cn(
        "flex-1 gap-4 overflow-y-auto md:grid md:h-full md:grid-cols-5",
        props.selectedTab?.includes("timeline")
          ? "md:grid-cols-[3fr_2fr] xl:grid-cols-[4fr_2fr]"
          : "md:grid-cols-[2fr_3fr] xl:grid-cols-[2fr_4fr]",
      )}
    >
      <div className="border-r md:flex md:h-full md:flex-col md:overflow-hidden">
        <Command className="mt-2 flex h-full flex-col gap-2 overflow-hidden rounded-none border-0">
          <div className="flex flex-row justify-between px-3 pl-5">
            {props.selectedTab?.includes("timeline") ? (
              <div className="flex h-full items-center gap-1">
                <Button
                  onClick={() => {
                    setExpandedItems([
                      `trace-${props.trace.id}`,
                      ...getNestedObservationKeys(props.observations),
                    ]);
                  }}
                  size="xs"
                  variant="ghost"
                  title="Expand all"
                  className="px-0 text-muted-foreground"
                >
                  <ChevronsUpDown className="h-4 w-4" />
                </Button>
                <Button
                  onClick={() => setExpandedItems([])}
                  size="xs"
                  variant="ghost"
                  title="Collapse all"
                  className="px-0 text-muted-foreground"
                >
                  <ChevronsDownUp className="h-4 w-4" />
                </Button>
                <span className="px-1 py-2 text-sm text-muted-foreground">
                  Node display
                </span>
              </div>
            ) : (
              <CommandInput
                showBorder={false}
                placeholder="Search (type, title, id)"
                className="-ml-2 h-9 border-0 focus:ring-0"
              />
            )}
            {viewType === "detailed" && (
              <div className="flex flex-row items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Settings</DropdownMenuLabel>
                    <DropdownMenuSeparator />

                    {isGraphViewAvailable && (
                      <>
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
                        <DropdownMenuSeparator />
                      </>
                    )}

                    <DropdownMenuGroup>
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
                      >
                        <div className="flex w-full items-center justify-between">
                          <span className="mr-2">Color Code Metrics</span>
                          <Switch
                            checked={colorCodeMetricsOnObservationTree}
                            onCheckedChange={(e) =>
                              setColorCodeMetricsOnObservationTree(e)
                            }
                          />
                        </div>
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />

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
                <Switch
                  checked={props.selectedTab?.includes("timeline")}
                  onCheckedChange={(checked) =>
                    props.setSelectedTab?.(checked ? "timeline" : "preview")
                  }
                ></Switch>
                <span className="text-sm">Timeline</span>
              </div>
            )}
          </div>
          <div className="h-full overflow-hidden">
            {props.selectedTab?.includes("timeline") ? (
              <div className="h-full w-full flex-1 flex-col overflow-hidden">
                {isGraphViewAvailable && showGraph ? (
                  <div className="flex h-full w-full flex-col overflow-hidden">
                    <div className="h-1/2 w-full overflow-y-auto overflow-x-hidden">
                      <TraceTimelineView
                        key={`timeline-${props.trace.id}`}
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
                    <div className="h-1/2 w-full overflow-hidden border-t">
                      <TraceGraphView
                        key={`graph-timeline-${props.trace.id}`}
                        agentGraphData={agentGraphData}
                      />
                    </div>
                  </div>
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
              <div className="h-full w-full flex-1 flex-col overflow-hidden">
                {isGraphViewAvailable && showGraph ? (
                  <div className="flex h-full w-full flex-col overflow-hidden">
                    <div className="h-1/2 w-full overflow-y-auto">
                      <ObservationTree
                        observations={props.observations}
                        collapsedObservations={collapsedObservations}
                        toggleCollapsedObservation={toggleCollapsedObservation}
                        collapseAll={collapseAll}
                        expandAll={expandAll}
                        trace={props.trace}
                        scores={props.scores}
                        currentObservationId={currentObservationId ?? undefined}
                        setCurrentObservationId={setCurrentObservationId}
                        showMetrics={metricsOnObservationTree}
                        showScores={scoresOnObservationTree}
                        showComments={showComments}
                        colorCodeMetrics={colorCodeMetricsOnObservationTree}
                        observationCommentCounts={observationCommentCounts.data}
                        traceCommentCounts={traceCommentCounts.data}
                        className="flex w-full flex-col px-3"
                        minLevel={minObservationLevel}
                        setMinLevel={setMinObservationLevel}
                      />
                    </div>
                    <div className="h-1/2 w-full overflow-hidden border-t">
                      <TraceGraphView
                        key={`graph-tree-${props.trace.id}`}
                        agentGraphData={agentGraphData}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full w-full overflow-auto">
                    <ObservationTree
                      observations={props.observations}
                      collapsedObservations={collapsedObservations}
                      toggleCollapsedObservation={toggleCollapsedObservation}
                      collapseAll={collapseAll}
                      expandAll={expandAll}
                      trace={props.trace}
                      scores={props.scores}
                      currentObservationId={currentObservationId ?? undefined}
                      setCurrentObservationId={setCurrentObservationId}
                      showMetrics={metricsOnObservationTree}
                      showScores={scoresOnObservationTree}
                      showComments={showComments}
                      colorCodeMetrics={colorCodeMetricsOnObservationTree}
                      observationCommentCounts={observationCommentCounts.data}
                      traceCommentCounts={traceCommentCounts.data}
                      className="flex w-full flex-col px-3"
                      minLevel={minObservationLevel}
                      setMinLevel={setMinObservationLevel}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </Command>
      </div>
      <div className="overflow-hidden pl-3 md:h-full md:p-0">
        {currentObservationId === undefined ||
        currentObservationId === "" ||
        currentObservationId === null ? (
          <TracePreview
            trace={props.trace}
            observations={props.observations}
            scores={props.scores}
            commentCounts={traceCommentCounts.data}
            viewType={viewType}
          />
        ) : isValidObservationId ? (
          <ObservationPreview
            observations={props.observations}
            scores={props.scores}
            projectId={props.projectId}
            currentObservationId={currentObservationId}
            traceId={props.trace.id}
            commentCounts={observationCommentCounts.data}
            viewType={viewType}
            isTimeline={props.selectedTab?.includes("timeline")}
          />
        ) : null}
      </div>
    </div>
  );
}
