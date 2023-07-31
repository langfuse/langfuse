import { type Trace, type Observation, type Score } from "@prisma/client";
import { useRouter } from "next/router";
import { ObservationTree } from "./ObservationTree";
import { ObservationPreview } from "./ObservationPreview";
import { TracePreview } from "./TracePreview";

export function Trace(props: {
  observations: Observation[];
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
      }
    );
  };

  return (
    <div className="flex flex-col gap-8 md:flex-row-reverse">
      <ObservationTree
        observations={props.observations}
        trace={props.trace}
        scores={props.scores}
        currentObservationId={currentObservationId}
        setCurrentObservationId={setCurrentObservationId}
      />

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
  );
}
