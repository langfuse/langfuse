import { type Trace, type Score } from "@prisma/client";
import { ObservationTree } from "./ObservationTree";
import { ObservationPreview } from "./ObservationPreview";
import { TracePreview } from "./TracePreview";

import Header from "@/src/components/layouts/header";
import { Badge } from "@/src/components/ui/badge";
import { TraceAggUsageBadge } from "@/src/components/token-usage-badge";
import Decimal from "decimal.js";
import { StringParam, useQueryParam } from "use-query-params";
import { PublishTraceSwitch } from "@/src/components/publish-object-switch";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { useRouter } from "next/router";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
import { api } from "@/src/utils/api";
import { DeleteTrace } from "@/src/components/delete-trace";
import { StarTraceToggle } from "@/src/components/star-toggle";
import Link from "next/link";
import { NoAccessError } from "@/src/components/no-access";
import useLocalStorage from "@/src/components/useLocalStorage";
import { Toggle } from "@/src/components/ui/toggle";
import { ChevronsDownUp, ChevronsUpDown, StarHalf } from "lucide-react";

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
    <div className="grid h-full gap-4 md:grid-cols-3">
      <div className="md:col-span-2 md:h-full md:overflow-y-auto">
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
      <div className="md:h-full md:overflow-hidden">
        <div className="mb-2 flex flex-row justify-end gap-2">
          <Toggle
            pressed={scoresOnObservationTree}
            onPressedChange={(e) => {
              setScoresOnObservationTree(e);
            }}
            size="sm"
            title="Show scores"
          >
            <StarHalf className="h-4 w-4" />
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
        <ObservationTree
          observations={props.observations}
          trace={props.trace}
          scores={props.scores}
          currentObservationId={currentObservationId ?? undefined}
          setCurrentObservationId={setCurrentObservationId}
          showMetrics={metricsOnObservationTree}
          showScores={scoresOnObservationTree}
          className="md:h-full md:overflow-y-auto"
        />
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
  const totalCost = trace.data?.observations.reduce(
    (acc, o) => {
      if (!o.price) return acc;

      return acc ? acc.plus(o.price) : new Decimal(0).plus(o.price);
    },
    undefined as Decimal | undefined,
  );

  if (trace.error?.data?.code === "UNAUTHORIZED") return <NoAccessError />;
  if (!trace.data) return <div>loading...</div>;

  return (
    <div className="flex flex-col overflow-hidden xl:container md:h-[calc(100vh-100px)] xl:h-[calc(100vh-40px)]">
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
            <StarTraceToggle
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
            href={`/project/${router.query.projectId as string}/sessions/${
              trace.data.sessionId
            }`}
          >
            <Badge>Session: {trace.data.sessionId}</Badge>
          </Link>
        ) : null}
        {trace.data.userId ? (
          <Link
            href={`/project/${router.query.projectId as string}/users/${
              trace.data.userId
            }`}
          >
            <Badge>User ID: {trace.data.userId}</Badge>
          </Link>
        ) : null}
        <TraceAggUsageBadge observations={trace.data.observations} />
        {totalCost ? (
          <Badge variant="outline">
            Total cost: {totalCost.toString()} USD
          </Badge>
        ) : undefined}
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
