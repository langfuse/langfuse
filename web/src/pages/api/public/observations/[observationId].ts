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
import { getObservationViewById } from "@langfuse/shared/src/server";

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
          const observation = await getObservationViewById(
            observationId,
            auth.scope.projectId,
            true,
          );
          if (!observation) {
            throw new LangfuseNotFoundError(
              "Observation not found within authorized project",
            );
          }

          const model = observation.modelId
            ? await prisma.model.findFirst({
                where: {
                  AND: [
                    {
                      id: observation.modelId,
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

          // eslint-disable-next-line @typescript-eslint/no-unused-vars

          return {
            ...observation,
            modelId: model?.id ?? null,
            inputPrice:
              model?.Price?.find((m) => m.usageType === "input")?.price ?? null,
            outputPrice:
              model?.Price?.find((m) => m.usageType === "output")?.price ??
              null,
            totalPrice:
              model?.Price?.find((m) => m.usageType === "total")?.price ?? null,
          };
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
