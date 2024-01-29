import { type Trace, type Score } from "@prisma/client";
import { ObservationTree } from "./ObservationTree";
import { ObservationPreview } from "./ObservationPreview";
import { TracePreview } from "./TracePreview";

import Header from "@/src/components/layouts/header";
import { Badge } from "@/src/components/ui/badge";
import { TraceAggUsageBadge } from "@/src/components/token-usage-badge";
import { StringParam, useQueryParam } from "use-query-params";
import { PublishTraceSwitch } from "@/src/components/publish-object-switch";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { useRouter } from "next/router";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
import { api } from "@/src/utils/api";
import { DeleteTrace } from "@/src/components/delete-trace";
import { StarTraceDetailsToggle } from "@/src/components/star-toggle";
import Link from "next/link";
import { NoAccessError } from "@/src/components/no-access";
import { TagTraceDetailsPopover } from "@/src/features/tag/components/TagTraceDetailsPopover";
import useLocalStorage from "@/src/components/useLocalStorage";
import { Toggle } from "@/src/components/ui/toggle";
import { Award, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { usdFormatter } from "@/src/utils/numbers";
import type Decimal from "decimal.js";

export function Trace(props: {
  observations: Array<ObservationReturnType>;
  trace: Trace;
  scores: Score[];
  projectId: string;
}) {
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

  return (
    <div className="grid gap-4 md:h-full md:grid-cols-3">
      <ScrollArea className="md:col-span-2 md:h-full">
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
      </ScrollArea>
      <div className="md:flex md:h-full md:flex-col md:overflow-hidden">
        <div className="mb-2 flex flex-shrink-0 flex-row justify-end gap-2">
          <Toggle
            pressed={scoresOnObservationTree}
            onPressedChange={(e) => {
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
        <ScrollArea className="flex flex-grow">
          <ObservationTree
            observations={props.observations}
            trace={props.trace}
            scores={props.scores}
            currentObservationId={currentObservationId ?? undefined}
            setCurrentObservationId={setCurrentObservationId}
            showMetrics={metricsOnObservationTree}
            showScores={scoresOnObservationTree}
          />
        </ScrollArea>
      </div>
    </div>
  );
}

export function TracePage({ traceId }: { traceId: string }) {
  const router = useRouter();
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

  const totalCost: Decimal | undefined = trace.data?.observations.reduce(
    (prev: Decimal | undefined, curr: ObservationReturnType) => {
      if (!curr.calculatedTotalCost) return prev;

      return prev
        ? prev.plus(curr.calculatedTotalCost)
        : curr.calculatedTotalCost;
    },
    undefined,
  );
  if (trace.error?.data?.code === "UNAUTHORIZED") return <NoAccessError />;
  if (!trace.data) return <div>loading...</div>;
  return (
    <div className="flex flex-col overflow-hidden xl:container md:h-[calc(100vh-2rem)]">
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
              path={(id) =>
                `/project/${router.query.projectId as string}/traces/${id}`
              }
              listKey="traces"
            />
            <DeleteTrace
              traceId={trace.data.id}
              projectId={trace.data.projectId}
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
          />
        </div>
      </div>
      <div className="mt-5 flex-1 overflow-hidden border-t pt-5">
        <Trace
          key={trace.data.id}
          trace={trace.data}
          scores={trace.data.scores}
          projectId={trace.data.projectId}
          observations={trace.data.observations}
        />
      </div>
    </div>
  );
}
