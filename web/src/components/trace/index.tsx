import { type Trace, type Score } from "@langfuse/shared";
import { ObservationTree } from "./ObservationTree";
import { ObservationPreview } from "./ObservationPreview";
import { TracePreview } from "./TracePreview";

import Header from "@/src/components/layouts/header";
import { Badge } from "@/src/components/ui/badge";
import { TraceAggUsageBadge } from "@/src/components/token-usage-badge";
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
  ListTree,
  Network,
  Terminal,
} from "lucide-react";
import { usdFormatter } from "@/src/utils/numbers";
import Decimal from "decimal.js";
import { useCallback, useState } from "react";
import { DeleteButton } from "@/src/components/deleteButton";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { TraceTimelineView } from "@/src/components/trace/TraceTimelineView";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";

export function Trace(props: {
  observations: Array<ObservationReturnType>;
  trace: Trace;
  scores: Score[];
  projectId: string;
}) {
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

  const [collapsedObservations, setCollapsedObservations] = useState<string[]>(
    [],
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
          />
        ) : (
          <ObservationPreview
            observations={props.observations}
            scores={props.scores}
            projectId={props.projectId}
            currentObservationId={currentObservationId}
            traceId={props.trace.id}
          />
        )}
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
            size="sm"
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
            size="sm"
            title="Show metrics"
          >
            {metricsOnObservationTree ? (
              <ChevronsDownUp className="h-4 w-4" />
            ) : (
              <ChevronsUpDown className="h-4 w-4" />
            )}
          </Toggle>
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
          className="flex w-full flex-col overflow-y-auto"
        />
      </div>
    </div>
  );
}

export function TracePage({ traceId }: { traceId: string }) {
  const capture = usePostHogClientCapture();
  const router = useRouter();
  const utils = api.useUtils();
  const trace = api.traces.byId.useQuery(
    { traceId },
    {
      retry(failureCount, error) {
        if (error.data?.code === "UNAUTHORIZED") return false;
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
      enabled: !!trace.data?.projectId && trace.isSuccess,
    },
  );

  const filterOptionTags = traceFilterOptions.data?.tags ?? [];
  const allTags = filterOptionTags.map((t) => t.value);

  const totalCost = calculateDisplayTotalCost(trace.data?.observations ?? []);

  const [selectedTab, setSelectedTab] = useQueryParam(
    "display",
    withDefault(StringParam, "details"),
  );

  if (trace.error?.data?.code === "UNAUTHORIZED")
    return <ErrorPage message="You do not have access to this trace." />;
  if (!trace.data) return <div>loading...</div>;
  return (
    <div className="flex flex-col overflow-hidden 2xl:container md:h-[calc(100vh-2rem)]">
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
              path={(id) => {
                const { view, display, projectId } = router.query;
                const queryParams = new URLSearchParams({
                  ...(typeof view === "string" ? { view } : {}),
                  ...(typeof display === "string" ? { display } : {}),
                });
                const queryParamString = Boolean(queryParams.size)
                  ? `?${queryParams.toString()}`
                  : "";
                return `/project/${projectId as string}/traces/${id}${queryParamString}`;
              }}
              listKey="traces"
            />
            <DeleteButton
              itemId={traceId}
              projectId={trace.data.projectId}
              scope="traces:delete"
              invalidateFunc={() => void utils.traces.invalidate()}
              type="trace"
              redirectUrl={`/project/${router.query.projectId as string}/traces`}
            />
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
        <TraceAggUsageBadge observations={trace.data.observations} />
        {totalCost ? (
          <Badge variant="outline">
            Total cost: {usdFormatter(totalCost.toNumber())}
          </Badge>
        ) : undefined}
      </div>
      <div className="mt-5 rounded-lg border bg-card font-semibold text-card-foreground shadow-sm">
        <div className="flex flex-row items-center gap-3 p-2.5">
          Tags
          <TagTraceDetailsPopover
            tags={trace.data.tags}
            availableTags={allTags}
            traceId={trace.data.id}
            projectId={trace.data.projectId}
            className="flex-wrap"
          />
        </div>
      </div>
      <Tabs
        value={selectedTab}
        onValueChange={(tab) => {
          setSelectedTab(tab);
          capture("trace_detail:display_mode_switch", { view: tab });
        }}
        className="flex w-full justify-end border-b bg-background"
      >
        <TabsList className="bg-background py-0">
          <TabsTrigger
            value="details"
            className="h-full rounded-none border-b-4 border-transparent data-[state=active]:border-primary-accent data-[state=active]:shadow-none"
          >
            <Network className="mr-1 h-4 w-4"></Network>
            Tree
          </TabsTrigger>
          <TabsTrigger
            value="timeline"
            className="h-full rounded-none border-b-4 border-transparent data-[state=active]:border-primary-accent data-[state=active]:shadow-none"
          >
            <ListTree className="mr-1 h-4 w-4"></ListTree>
            Timeline
            <Badge className="pointer-events-none ml-2 px-1.5">Beta</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {selectedTab === "details" && (
        <div className="mt-5 flex-1 overflow-hidden border-t pt-5">
          <Trace
            key={trace.data.id}
            trace={trace.data}
            scores={trace.data.scores}
            projectId={trace.data.projectId}
            observations={trace.data.observations}
          />
        </div>
      )}
      {selectedTab === "timeline" && (
        <div className="mt-5 flex-1 flex-col space-y-5 overflow-hidden">
          <Alert>
            <Terminal className="h-4 w-4" />
            <AlertTitle>New Trace Timeline (beta)</AlertTitle>
            <AlertDescription>
              We value your feedback! Share your thoughts on{" "}
              <a
                href="https://github.com/orgs/langfuse/discussions/2195"
                target="_blank"
                className="underline"
                rel="noopener noreferrer"
              >
                GitHub discussions
              </a>
              .
            </AlertDescription>
          </Alert>
          <TraceTimelineView
            key={trace.data.id}
            trace={trace.data}
            scores={trace.data.scores}
            observations={trace.data.observations}
            projectId={trace.data.projectId}
          />
        </div>
      )}
    </div>
  );
}

export const calculateDisplayTotalCost = (
  observations: ObservationReturnType[],
) => {
  return observations.reduce(
    (prev: Decimal | undefined, curr: ObservationReturnType) => {
      // if we don't have any calculated costs, we can't do anything
      if (
        !curr.calculatedTotalCost &&
        !curr.calculatedInputCost &&
        !curr.calculatedOutputCost
      )
        return prev;

      // if we have either input or output cost, but not total cost, we can use that
      if (
        !curr.calculatedTotalCost &&
        (curr.calculatedInputCost || curr.calculatedOutputCost)
      ) {
        return prev
          ? prev.plus(
              curr.calculatedInputCost ??
                new Decimal(0).plus(
                  curr.calculatedOutputCost ?? new Decimal(0),
                ),
            )
          : curr.calculatedInputCost ?? curr.calculatedOutputCost ?? undefined;
      }

      if (!curr.calculatedTotalCost) return prev;

      // if we have total cost, we can use that
      return prev
        ? prev.plus(curr.calculatedTotalCost)
        : curr.calculatedTotalCost;
    },
    undefined,
  );
};
