import { type Trace, type Observation, type Score } from "@prisma/client";
import { useRouter } from "next/router";
import { ObservationTree } from "./ObservationTree";
import { ObservationPreview } from "./ObservationPreview";
import { TracePreview } from "./TracePreview";

export function Trace(props: {
  observations: Array<Observation & { traceId: string }>;
  trace: Trace;
  scores: Score[];
  projectId: string;
}) {
  const router = useRouter();
  const currentObservationId = router.query.observation as string | undefined;
  const setCurrentObservationId = (id: string | undefined) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { observation, ...query } = router.query;
    void router.replace(
      {
        pathname: router.pathname,
        query: {
          ...query,
          ...(id !== undefined ? { observation: id } : {}),
        },
      },
      undefined,
      {
        scroll: false,
      },
    );
  };

  return (
    <div className="grid h-full gap-4 md:grid-cols-3">
      <div className="col-span-1 lg:hidden">
        <ObservationTree
          observations={props.observations}
          trace={props.trace}
          scores={props.scores}
          currentObservationId={currentObservationId}
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
            currentObservationId={currentObservationId}
          />
        )}
      </div>
      <div className="col-span-1 hidden h-full overflow-y-auto lg:block">
        <ObservationTree
          observations={props.observations}
          trace={props.trace}
          scores={props.scores}
          currentObservationId={currentObservationId}
          setCurrentObservationId={setCurrentObservationId}
        />
      </div>
    </div>
  );
}
