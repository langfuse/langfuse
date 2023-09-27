import { type Trace, type Observation, type Score } from "@prisma/client";
import { ObservationTree } from "./ObservationTree";
import { ObservationPreview } from "./ObservationPreview";
import { TracePreview } from "./TracePreview";

import Header from "@/src/components/layouts/header";
import { Badge } from "@/src/components/ui/badge";
import { TraceAggUsageBadge } from "@/src/components/token-usage-badge";
import Decimal from "decimal.js";
import { type RouterOutput } from "@/src/utils/types";
import { StringParam, useQueryParam } from "use-query-params";
import { PublishTraceSwitch } from "@/src/features/public-traces/components/PublishTraceSwitch";

export function Trace(props: {
  observations: Array<Observation & { traceId: string }>;
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
        {currentObservationId === undefined || currentObservationId === "" ? (
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
            currentObservationId={currentObservationId ?? undefined}
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

export function TracePage({
  trace,
}: {
  trace: RouterOutput["traces"]["byId"];
}) {
  const totalCost = trace.observations.reduce(
    (acc, o) => {
      if (!o.price) return acc;

      return acc
        ? acc.plus(o.price ? o.price : new Decimal(0))
        : new Decimal(0).plus(o.price ? o.price : new Decimal(0));
    },
    undefined as Decimal | undefined,
  );

  return (
    <div className="flex flex-col overflow-hidden xl:container lg:h-[calc(100vh-100px)] xl:h-[calc(100vh-50px)]">
      <Header
        title="Trace Detail"
        actionButtons={
          <PublishTraceSwitch
            traceId={trace.id}
            projectId={trace.projectId}
            isPublic={trace.public}
          />
        }
      />
      <div className="flex gap-2">
        {trace.externalId ? (
          <Badge variant="outline">External ID: {trace.externalId}</Badge>
        ) : null}
        {trace.userId ? (
          <Badge variant="outline">User ID: {trace.userId}</Badge>
        ) : null}
        <TraceAggUsageBadge observations={trace.observations ?? []} />
        {totalCost ? (
          <Badge variant="outline">
            Total cost: {totalCost.toString()} USD
          </Badge>
        ) : undefined}
      </div>
      <div className="mt-5 flex-1 overflow-hidden border-t pt-5">
        <Trace
          key={trace.id}
          trace={trace}
          scores={trace.scores}
          projectId={trace.projectId}
          observations={trace.observations ?? []}
        />
      </div>
    </div>
  );
}
