import { prisma } from "@langfuse/shared/src/db";
import {
  GetObservationV1Query,
  GetObservationV1Response,
  transformDbToApiObservation,
} from "@/src/features/public-api/types/observations";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { getObservationById } from "@langfuse/shared/src/server";
import { z } from "zod/v4";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Observation",
    querySchema: GetObservationV1Query.extend({
      optimization: z.enum(["original", "jsonsimd", "worker"]).optional(),
    }),
    responseSchema: GetObservationV1Response,
    fn: async ({ query, auth }) => {
      const clickhouseObservation = await getObservationById({
        id: query.observationId,
        projectId: auth.scope.projectId,
        fetchWithInputOutput: true,
      });
      if (!clickhouseObservation) {
        throw new LangfuseNotFoundError(
          "Observation not found within authorized project",
        );
      }

      const model = clickhouseObservation.internalModelId
        ? await prisma.model.findFirst({
            where: {
              AND: [
                {
                  id: clickhouseObservation.internalModelId,
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

      const observation = {
        ...clickhouseObservation,
        modelId: model?.id ?? null,
        inputPrice:
          model?.Price?.find((m) => m.usageType === "input")?.price ?? null,
        outputPrice:
          model?.Price?.find((m) => m.usageType === "output")?.price ?? null,
        totalPrice:
          model?.Price?.find((m) => m.usageType === "total")?.price ?? null,
      };

      if (!observation) {
        throw new LangfuseNotFoundError(
          "Observation not found within authorized project",
        );
      }

      const transformed = transformDbToApiObservation(observation);

      if (query.optimization && query.optimization !== "original") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (transformed as any).optimization = query.optimization;
      }

      return transformed;
    },
  }),
});
