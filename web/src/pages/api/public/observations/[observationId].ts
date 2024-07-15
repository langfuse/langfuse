import { prisma } from "@langfuse/shared/src/db";
import {
  GetObservationV1Query,
  GetObservationV1Response,
  transformDbToApiObservation,
} from "@/src/features/public-api/types/observations";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { env } from "@/src/env.mjs";
import { getObservation } from "@/src/server/api/repositories/clickhouse";

export default withMiddlewares({
  GET: createAuthedAPIRoute({
    name: "Get Observation",
    querySchema: GetObservationV1Query,
    responseSchema: GetObservationV1Response,
    fn: async ({ query, auth }) => {
      const { observationId } = query;
      const observation = env.CLICKHOUSE_URL
        ? await getObservation(observationId, auth.scope.projectId)
        : await prisma.observationView.findFirst({
            where: {
              id: observationId,
              projectId: auth.scope.projectId,
            },
          });
      if (!observation) {
        throw new LangfuseNotFoundError(
          "Observation not found within authorized project",
        );
      }
      return transformDbToApiObservation(observation);
    },
  }),
});
