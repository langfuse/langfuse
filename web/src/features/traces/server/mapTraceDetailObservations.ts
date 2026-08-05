import { type Observation } from "@langfuse/shared";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { toDomainWithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";

export function mapTraceDetailObservations(
  observations: Observation[],
  includeObservationIO: boolean,
): ObservationReturnTypeWithMetadata[] {
  return observations.map((o) => {
    const observation = toDomainWithStringifiedMetadata(o);
    if (!includeObservationIO) {
      return {
        ...observation,
        output: undefined,
        input: undefined,
      };
    }

    return {
      ...observation,
      input: o.input != null ? JSON.stringify(o.input) : null,
      output: o.output != null ? JSON.stringify(o.output) : null,
    };
  }) as ObservationReturnTypeWithMetadata[];
}
