import { type Trace, type Score } from "@prisma/client";
import { ObservationTree } from "./ObservationTree";
import { ObservationPreview } from "./ObservationPreview";
import { TracePreview } from "./TracePreview";

import Header from "@/src/components/layouts/header";
import { Badge } from "@/src/components/ui/badge";
import { TraceAggUsageBadge } from "@/src/components/token-usage-badge";
import Decimal from "decimal.js";
import { StringParam, useQueryParam } from "use-query-params";
import { PublishTraceSwitch } from "@/src/features/public-traces/components/PublishTraceSwitch";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { useRouter } from "next/router";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
import { api } from "@/src/utils/api";

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

  return (
    <div className="grid h-full gap-4 md:grid-cols-3">
      <div className="col-span-1 lg:hidden">
        <ObservationTree
          observations={props.observations}
          trace={props.trace}
          scores={props.scores}
          currentObservationId={currentObservationId ?? undefined}
          setCurrentObservationId={setCurrentObservationId}
        />
      </div>
      <div className="col-span-2 h-full overflow-y-auto">
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
      <div className="col-span-1 hidden h-full overflow-y-auto lg:block">
        <ObservationTree
          observations={props.observations}
          trace={props.trace}
          scores={props.scores}
          currentObservationId={currentObservationId ?? undefined}
          setCurrentObservationId={setCurrentObservationId}
        />
      </div>
    </div>
  );
}

export function TracePage({ traceId }: { traceId: string }) {
  const router = useRouter();
  const trace = api.traces.byId.useQuery({ traceId });
  const totalCost = trace.data?.observations.reduce(
    (acc, o) => {
      if (!o.price) return acc;

      return acc
        ? acc.plus(o.price ? o.price : new Decimal(0))
        : new Decimal(0).plus(o.price ? o.price : new Decimal(0));
    },
    undefined as Decimal | undefined,
  );

  if (!trace.data) return <div>loading...</div>;

  return (
    <div className="flex flex-col overflow-hidden xl:container lg:h-[calc(100vh-100px)] xl:h-[calc(100vh-50px)]">
      <Header
        title="Trace Detail"
        actionButtons={
          <>
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
          </>
        }
      />
      <div className="flex gap-2">
        {trace.data.userId ? (
          <Badge variant="outline">User ID: {trace.data.userId}</Badge>
        ) : null}
        <TraceAggUsageBadge observations={trace.data.observations ?? []} />
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
          observations={trace.data.observations ?? []}
        />
      </div>
    </div>
  );
}
