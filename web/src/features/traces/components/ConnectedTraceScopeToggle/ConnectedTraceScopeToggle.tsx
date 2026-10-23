import { useRouter } from "next/router";
import { TraceScopeToggle } from "@/src/features/traces/components/TraceScopeToggle/TraceScopeToggle";

export function ConnectedTraceScopeToggle({
  value,
  canSelectSession,
  observations,
}: {
  value: "trace" | "session";
  canSelectSession: boolean;
  observations: readonly { id: string }[];
}) {
  const router = useRouter();
  return (
    <TraceScopeToggle
      value={value}
      canSelectSession={canSelectSession}
      onValueChange={(next) => {
        const query = { ...router.query };
        if (next === "session") {
          query.aggregation = "session";
        } else {
          delete query.aggregation;
          if (
            !observations.some(
              (observation) => observation.id === query.observation,
            )
          ) {
            delete query.observation;
          }
        }
        void router.replace({ pathname: router.pathname, query }, undefined, {
          shallow: true,
        });
      }}
    />
  );
}
