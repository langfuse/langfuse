import { type Trace } from "@langfuse/shared";
import { ObservationTree } from "./ObservationTree";
import { ObservationPreview } from "./ObservationPreview";
import { TracePreview } from "./TracePreview";
import {
  StringParam,
  type UrlUpdateType,
  useQueryParam,
  withDefault,
} from "use-query-params";
import { PublishTraceSwitch } from "@/src/components/publish-object-switch";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { useRouter } from "next/router";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { api } from "@/src/utils/api";
import { StarTraceDetailsToggle } from "@/src/components/star-toggle";
import { ErrorPage } from "@/src/components/error-page";
import useLocalStorage from "@/src/components/useLocalStorage";
import { PlusSquareIcon, MinusSquare, Settings2 } from "lucide-react";
import { useCallback, useState } from "react";
import { DeleteButton } from "@/src/components/deleteButton";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { TraceTimelineView } from "@/src/components/trace/TraceTimelineView";
import { type APIScore, ObservationLevel } from "@langfuse/shared";
import { calculateDisplayTotalCost } from "@/src/components/trace/lib/helpers";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";

import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import Page from "@/src/components/layouts/page";
import { TraceGraphView } from "@/src/features/trace-graph-view/components/TraceGraphView";
import { isLanggraphTrace } from "@/src/features/trace-graph-view/utils/isLanggraphTrace";
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

export function Trace(props: {
  observations: Array<ObservationReturnTypeWithMetadata>;
  trace: Omit<Trace, "input" | "output"> & {
    input: string | undefined;
    output: string | undefined;
  };
  scores: APIScore[];
  projectId: string;
  viewType?: "detailed" | "focused";
  isValidObservationId?: boolean;
  defaultMinObservationLevel?: ObservationLevel;
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

  const [collapsedObservations, setCollapsedObservations] = useState<string[]>(
    [],
  );

  const [minObservationLevel, setMinObservationLevel] =
    useState<ObservationLevel>(
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

  const [expandedItems, setExpandedItems] = useSessionStorage<string[]>(
    `${props.trace.id}-expanded`,
    [`trace-${props.trace.id}`],
  );

  return (
    <div
      className={cn(
        "grid flex-1 gap-4 md:h-full md:grid-cols-5",
        props.selectedTab?.includes("timeline")
          ? "md:grid-cols-[3fr_2fr] xl:grid-cols-[4fr_2fr]"
          : "md:grid-cols-[2fr_3fr] xl:grid-cols-[2fr_4fr]",
      )}
    >
      <div className="border-r md:flex md:h-full md:flex-col md:overflow-hidden">
        <Command className="mt-1 flex h-full flex-col gap-2 overflow-hidden rounded-none border-0">
          <div className="flex flex-row justify-between px-3 pl-5">
            <CommandInput
              showBorder={false}
              placeholder="Search nodes..."
              className="-ml-2 h-9 border-0 focus:ring-0"
            />
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
              <Switch
                checked={props.selectedTab?.includes("timeline")}
                onCheckedChange={(checked) =>
                  props.setSelectedTab?.(checked ? "timeline" : "preview")
                }
              ></Switch>
              <span className="text-sm">Timeline</span>
              {props.selectedTab?.includes("timeline") ? (
                <div className="flex h-full items-center">
                  <Button
                    onClick={() => {
                      setExpandedItems([
                        `trace-${props.trace.id}`,
                        // ...nestedObservationKeys,
                      ]);
                    }}
                    size="xs"
                    variant="ghost"
                    title="Expand all"
                  >
                    <PlusSquareIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={() => setExpandedItems([])}
                    size="xs"
                    variant="ghost"
                    title="Collapse all"
                  >
                    <MinusSquare className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="overflow-y-auto px-3">
            {props.selectedTab?.includes("timeline") ? (
              <div className="h-full w-full flex-1 flex-col overflow-hidden">
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
                />
                {isLanggraphTrace(props.observations) ? (
                  <div className="h-full flex-1 overflow-hidden">
                    <TraceGraphView
                      key={props.trace.id}
                      trace={props.trace}
                      scores={props.scores}
                      observations={props.observations}
                      projectId={props.trace.projectId}
                    />
                  </div>
                ) : null}
              </div>
            ) : (
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
                className="flex w-full flex-col"
                minLevel={minObservationLevel}
                setMinLevel={setMinObservationLevel}
              />
            )}
          </div>
        </Command>
      </div>
      <div className="overflow-hidden md:h-full">
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

export function TracePage({
  traceId,
  timestamp,
}: {
  traceId: string;
  timestamp?: Date;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const trace = api.traces.byIdWithObservationsAndScores.useQuery(
    {
      traceId,
      timestamp,
      projectId: router.query.projectId as string,
    },
    {
      retry(failureCount, error) {
        if (
          error.data?.code === "UNAUTHORIZED" ||
          error.data?.code === "NOT_FOUND"
        )
          return false;
        return failureCount < 3;
      },
    },
  );

  // const totalCost = calculateDisplayTotalCost({
  //   allObservations: trace.data?.observations ?? [],
  // });

  const [selectedTab, setSelectedTab] = useQueryParam(
    "display",
    withDefault(StringParam, "details"),
  );

  const hasTraceDeletionEntitlement = useHasEntitlement("trace-deletion");

  if (trace.error?.data?.code === "UNAUTHORIZED")
    return <ErrorPage message="You do not have access to this trace." />;

  if (trace.error?.data?.code === "NOT_FOUND")
    return (
      <ErrorPage
        title="Trace not found"
        message="The trace is either still being processed or has been deleted."
        additionalButton={{
          label: "Retry",
          onClick: () => void window.location.reload(),
        }}
      />
    );

  if (!trace.data) return <div className="p-3">Loading...</div>;

  return (
    <Page
      withPadding={false}
      headerProps={{
        title: trace.data.name
          ? `${trace.data.name}: ${trace.data.id}`
          : trace.data.id,
        itemType: "TRACE",
        breadcrumb: [
          {
            name: "Traces",
            href: `/project/${router.query.projectId as string}/traces`,
          },
        ],
        actionButtonsLeft: (
          <>
            <StarTraceDetailsToggle
              traceId={trace.data.id}
              projectId={trace.data.projectId}
              value={trace.data.bookmarked}
            />
            <PublishTraceSwitch
              traceId={trace.data.id}
              projectId={trace.data.projectId}
              isPublic={trace.data.public}
            />
          </>
        ),
        actionButtonsRight: (
          <>
            <DetailPageNav
              currentId={traceId}
              path={(entry) => {
                const { view, display, projectId } = router.query;
                const queryParams = new URLSearchParams({
                  ...(typeof view === "string" ? { view } : {}),
                  ...(typeof display === "string" ? { display } : {}),
                });
                const queryParamString = Boolean(queryParams.size)
                  ? `?${queryParams.toString()}`
                  : "";

                const timestamp =
                  entry.params && entry.params.timestamp
                    ? encodeURIComponent(entry.params.timestamp)
                    : undefined;

                return `/project/${projectId as string}/traces/${entry.id}${queryParamString}${timestamp ? `?timestamp=${timestamp}` : ""}`;
              }}
              listKey="traces"
            />
            {hasTraceDeletionEntitlement && (
              <DeleteButton
                itemId={traceId}
                projectId={trace.data.projectId}
                scope="traces:delete"
                invalidateFunc={() => void utils.traces.all.invalidate()}
                type="trace"
                redirectUrl={`/project/${router.query.projectId as string}/traces`}
                deleteConfirmation={trace.data.name ?? ""}
                icon
              />
            )}
          </>
        ),
      }}
    >
      <div className="flex max-h-full min-h-0 flex-1 overflow-hidden">
        <Trace
          key={trace.data.id}
          trace={trace.data}
          scores={trace.data.scores}
          projectId={trace.data.projectId}
          observations={trace.data.observations}
          selectedTab={selectedTab}
          setSelectedTab={setSelectedTab}
        />
      </div>
    </Page>
  );
}
