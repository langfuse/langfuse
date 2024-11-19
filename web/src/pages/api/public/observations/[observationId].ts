import { prisma } from "@langfuse/shared/src/db";
import {
  GetObservationV1Query,
  GetObservationV1Response,
  transformDbToApiObservation,
} from "@/src/features/public-api/types/observations";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { measureAndReturnApi } from "@/src/server/utils/checkClickhouseAccess";
import { getObservationById } from "@langfuse/shared/src/server";
import { mergeObservationAndModel } from "@langfuse/shared/src/server";

export default withMiddlewares({
  GET: createAuthedAPIRoute({
    name: "Get Observation",
    querySchema: GetObservationV1Query,
    responseSchema: GetObservationV1Response,
    fn: async ({ query, auth }) => {
      const { observationId } = query;
      const observation = await measureAndReturnApi({
        input: { projectId: auth.scope.projectId, queryClickhouse: false },
        operation: "api/public/observations/[observationId]",
        user: null,
        pgExecution: async () => {
          return await prisma.observationView.findFirst({
            where: {
              id: observationId,
              projectId: auth.scope.projectId,
            },
          });
        },
        clickhouseExecution: async () => {
          const observation = await getObservationById(
            observationId,
            auth.scope.projectId,
          );
          if (!observation) {
            throw new LangfuseNotFoundError(
              "Observation not found within authorized project",
            );
          }

          const model = observation.internalModelId
            ? await prisma.model.findFirst({
                where: {
                  AND: [
                    {
                      id: observation.internalModelId,
                    },
                    {
                      OR: [
                        {
                          projectId: auth.scope.projectId,
                        },
                        {
                          projectId: null,
                        },
                      ],
                    },
                  ],
                },
                include: {
                  Price: true,
                },
                orderBy: {
                  projectId: {
                    sort: "desc",
                    nulls: "last",
                  },
                },
              })
            : undefined;

          const mergedObservation = mergeObservationAndModel(
            observation,
            model ?? undefined,
          );

          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const {
            inputCost,
            outputCost,
            totalCost,
            internalModelId,
            ...cleanedObservation
          } = mergedObservation;
          return cleanedObservation;
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
