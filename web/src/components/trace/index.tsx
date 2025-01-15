import { type Trace } from "@langfuse/shared";
import { ObservationTree } from "./ObservationTree";
import { ObservationPreview } from "./ObservationPreview";
import { TracePreview } from "./TracePreview";

import Header from "@/src/components/layouts/header";
import { Badge } from "@/src/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectLabel,
  SelectGroup,
} from "@/src/components/ui/select";
import { AggUsageBadge } from "@/src/components/token-usage-badge";
import { StringParam, useQueryParam, withDefault } from "use-query-params";
import { PublishTraceSwitch } from "@/src/components/publish-object-switch";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { useRouter } from "next/router";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
import { api } from "@/src/utils/api";
import { StarTraceDetailsToggle } from "@/src/components/star-toggle";
import Link from "next/link";
import { ErrorPage } from "@/src/components/error-page";
import { TagTraceDetailsPopover } from "@/src/features/tag/components/TagTraceDetailsPopover";
import useLocalStorage from "@/src/components/useLocalStorage";
import { Toggle } from "@/src/components/ui/toggle";
import {
  Award,
  ChevronsDownUp,
  ChevronsUpDown,
  FilterIcon,
  ListTree,
  Network,
  Percent,
} from "lucide-react";
import { usdFormatter } from "@/src/utils/numbers";
import { useCallback, useState } from "react";
import { DeleteButton } from "@/src/components/deleteButton";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { TraceTimelineView } from "@/src/components/trace/TraceTimelineView";
import { type APIScore, ObservationLevel } from "@langfuse/shared";
import { FullScreenPage } from "@/src/components/layouts/full-screen-page";
import { calculateDisplayTotalCost } from "@/src/components/trace/lib/helpers";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { useClickhouse } from "@/src/components/layouts/ClickhouseAdminToggle";
import {
  TabsBar,
  TabsBarContent,
  TabsBarList,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";

export function Trace(props: {
  observations: Array<ObservationReturnType>;
  trace: Trace;
  scores: APIScore[];
  projectId: string;
  viewType?: "detailed" | "focused";
  isValidObservationId?: boolean;
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

  const [collapsedObservations, setCollapsedObservations] = useState<string[]>(
    [],
  );

  const [minObservationLevel, setMinObservationLevel] =
    useState<ObservationLevel>(ObservationLevel.DEFAULT);

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

  return (
    <div className="grid gap-4 md:h-full md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
      <div className="overflow-y-auto md:col-span-3 md:h-full lg:col-span-4 xl:col-span-5">
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
          />
        ) : null}
      </div>
      <div className="md:col-span-2 md:flex md:h-full md:flex-col md:overflow-hidden">
        <div className="mb-2 flex flex-shrink-0 flex-row justify-end gap-2">
          <Toggle
            pressed={scoresOnObservationTree}
            onPressedChange={(e) => {
              capture("trace_detail:observation_tree_toggle_scores", {
                show: e,
              });
              setScoresOnObservationTree(e);
            }}
            size="xs"
            title="Show scores"
          >
            <Award className="h-4 w-4" />
          </Toggle>
          <Toggle
            pressed={metricsOnObservationTree}
            onPressedChange={(e) => {
              capture("trace_detail:observation_tree_toggle_metrics", {
                show: e,
              });
              setMetricsOnObservationTree(e);
            }}
            size="xs"
            title="Show metrics"
          >
            {metricsOnObservationTree ? (
              <ChevronsDownUp className="h-4 w-4" />
            ) : (
              <ChevronsUpDown className="h-4 w-4" />
            )}
          </Toggle>
          <Toggle
            pressed={colorCodeMetricsOnObservationTree}
            onPressedChange={(e) => setColorCodeMetricsOnObservationTree(e)}
            size="xs"
            title="Color code metrics (>50% yellow, >75% red)"
          >
            <Percent className="h-4 w-4" />
          </Toggle>
          <Select
            onValueChange={(v: ObservationLevel) => setMinObservationLevel(v)}
            value={minObservationLevel}
          >
            <SelectTrigger
              hideDownIcon
              className="focus:ring-none h-auto w-auto border-none px-0 py-0 text-sm focus:outline-none focus:ring-0 focus:ring-offset-0"
            >
              <Toggle
                pressed={colorCodeMetricsOnObservationTree}
                onPressedChange={(e) => setColorCodeMetricsOnObservationTree(e)}
                size="xs"
                title="Color code metrics (>50% yellow, >75% red)"
              >
                <FilterIcon className="h-4 w-4" />
              </Toggle>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel className="py-1 text-sm font-semibold">
                  Min. Level
                </SelectLabel>
                {Object.values(ObservationLevel).map((level) => (
                  <SelectItem value={level} key={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

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
          colorCodeMetrics={colorCodeMetricsOnObservationTree}
          observationCommentCounts={observationCommentCounts.data}
          traceCommentCounts={traceCommentCounts.data}
          minLevel={minObservationLevel}
          setMinLevel={setMinObservationLevel}
          className="flex w-full flex-col overflow-y-auto"
        />
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
  const capture = usePostHogClientCapture();
  const router = useRouter();
  const utils = api.useUtils();
  const isAuthenticatedAndProjectMember = useIsAuthenticatedAndProjectMember(
    router.query.projectId as string,
  );
  const trace = api.traces.byIdWithObservationsAndScores.useQuery(
    {
      traceId,
      timestamp,
      projectId: router.query.projectId as string,
      queryClickhouse: useClickhouse(),
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

  const traceFilterOptions = api.traces.filterOptions.useQuery(
    {
      projectId: trace.data?.projectId ?? "",
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      enabled:
        !!trace.data?.projectId &&
        trace.isSuccess &&
        isAuthenticatedAndProjectMember,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  const filterOptionTags = traceFilterOptions.data?.tags ?? [];
  const allTags = filterOptionTags.map((t) => t.value);

  const totalCost = calculateDisplayTotalCost({
    allObservations: trace.data?.observations ?? [],
  });

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

  if (!trace.data) return <div>loading...</div>;

  return (
    <FullScreenPage>
      <Header
        title="Trace Detail"
        breadcrumb={[
          {
            name: "Traces",
            href: `/project/${router.query.projectId as string}/traces`,
          },
          { name: traceId },
        ]}
        actionButtons={
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
              />
            )}
          </>
        }
      />
      <div className="flex flex-wrap gap-2">
        {trace.data.sessionId ? (
          <Link
            href={`/project/${
              router.query.projectId as string
            }/sessions/${encodeURIComponent(trace.data.sessionId)}`}
          >
            <Badge>Session: {trace.data.sessionId}</Badge>
          </Link>
        ) : null}
        {trace.data.userId ? (
          <Link
            href={`/project/${
              router.query.projectId as string
            }/users/${encodeURIComponent(trace.data.userId)}`}
          >
            <Badge>User ID: {trace.data.userId}</Badge>
          </Link>
        ) : null}
        <AggUsageBadge observations={trace.data.observations} />
        {totalCost ? (
          <Badge variant="outline">{usdFormatter(totalCost.toNumber())}</Badge>
        ) : undefined}
      </div>
      <div className="mt-3 rounded-lg border bg-card font-semibold text-card-foreground">
        <div className="flex flex-row items-center gap-3 px-3 py-1">
          <span className="text-sm">Tags</span>
          <TagTraceDetailsPopover
            tags={trace.data.tags}
            availableTags={allTags}
            traceId={trace.data.id}
            projectId={trace.data.projectId}
            className="flex-wrap"
            key={trace.data.id}
          />
        </div>
      </div>
      <TabsBar
        value={selectedTab}
        onValueChange={(tab) => {
          setSelectedTab(tab);
          capture("trace_detail:display_mode_switch", { view: tab });
        }}
      >
        <TabsBarList className="mt-2 w-full justify-end">
          <TabsBarTrigger value="details">
            <Network className="mr-1 h-4 w-4"></Network>
            Tree
          </TabsBarTrigger>
          <TabsBarTrigger value="timeline">
            <ListTree className="mr-1 h-4 w-4"></ListTree>
            Timeline
          </TabsBarTrigger>
        </TabsBarList>
        <TabsBarContent
          value="details"
          className="mt-5 h-full flex-1 overflow-y-auto md:overflow-hidden md:overflow-y-hidden"
        >
          <Trace
            key={trace.data.id}
            trace={trace.data}
            scores={trace.data.scores}
            projectId={trace.data.projectId}
            observations={trace.data.observations}
          />
        </TabsBarContent>
        <TabsBarContent
          value="timeline"
          className="mt-5 h-full flex-1 overflow-y-auto md:overflow-hidden md:overflow-y-hidden"
        >
          <TraceTimelineView
            key={trace.data.id}
            trace={trace.data}
            scores={trace.data.scores}
            observations={trace.data.observations}
            projectId={trace.data.projectId}
          />
        </TabsBarContent>
      </TabsBar>
    </FullScreenPage>
  );
}
