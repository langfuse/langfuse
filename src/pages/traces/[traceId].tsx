import { useRouter } from "next/router";
import Header from "~/components/layouts/header";

import { api } from "~/utils/api";

export default function TracePage() {
  const router = useRouter();
  const { traceId } = router.query;

  const trace = api.traces.byId.useQuery(traceId as string, {
    enabled: traceId !== undefined,
  });

  const obs =
    trace.data?.Observations.map(({ id, name, type, parentObservationId }) => ({
      id,
      name,
      type,
      parentId: parentObservationId ?? undefined,
    })) ?? [];
  const nestedObs = transformToNestedObservations(obs);

  return (
    <>
      <Header
        title="Traces"
        breadcrumb={[
          { name: "Traces", href: "/traces" },
          { name: traceId as string },
        ]}
      />
      <div>
        {nestedObs.map((obs) => (
          <ObservationDisplay key={obs.id} obs={obs} />
        ))}
      </div>
      <pre>{JSON.stringify(nestedObs, null, 2)}</pre>
      <pre>{JSON.stringify(trace.data, null, 2)}</pre>
    </>
  );
}

function ObservationDisplay(props: { obs: NestedObservation }) {
  return (
    <div>
      <div>{props.obs.name}</div>
      <div className="ml-5">
        {props.obs.children.map((obs) => (
          <ObservationDisplay key={obs.name} obs={obs} />
        ))}
      </div>
    </div>
  );
}

type Observation = {
  id: string;
  name: string;
  type: string;
};

type UnnestedObservation = Observation & {
  parentId?: string;
};

type NestedObservation = Observation & {
  children: NestedObservation[];
};

function transformToNestedObservations(
  unnestedObservations: UnnestedObservation[]
): NestedObservation[] {
  const nestedObservationsMap: { [id: string]: NestedObservation } = {};

  unnestedObservations.forEach((obs) => {
    const { id, name, type, parentId } = obs;
    const nestedObservation: NestedObservation = {
      id,
      name,
      type,
      children: [],
    };

    nestedObservationsMap[id] = nestedObservation;

    if (parentId && (nestedObservationsMap[parentId] as NestedObservation)) {
      (nestedObservationsMap[parentId] as NestedObservation).children.push(
        nestedObservation
      );
    }
  });

  const rootObservations: NestedObservation[] = [];

  unnestedObservations.forEach((obs) => {
    if (!obs.parentId) {
      rootObservations.push(nestedObservationsMap[obs.id] as NestedObservation);
    }
  });

  return rootObservations;
}
