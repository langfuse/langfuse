import { prisma } from "@langfuse/shared/src/db";
import {
  GetObservationV1Query,
  GetObservationV1Response,
  transformDbToApiObservation,
} from "@/src/features/public-api/types/observations";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  JSON_OPTIMIZATION_STRATEGIES,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { getObservationById } from "@langfuse/shared/src/server";
import { z } from "zod/v4";
import { jsonParserPool } from "@/src/server/utils/json/WorkerPool";
import { streamResponse } from "@/src/server/utils/streaming";

jsonParserPool.start();

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Observation",
    querySchema: GetObservationV1Query.extend({
      optimization: z.enum(JSON_OPTIMIZATION_STRATEGIES).optional(),
    }),
    responseSchema: GetObservationV1Response,
    fn: async ({ query, auth, req: _req, res }) => {
      const clickhouseObservation = await getObservationById({
        id: query.observationId,
        projectId: auth.scope.projectId,
        fetchWithInputOutput: true,
        optimization: query.optimization,
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
        if (query.optimization == "worker") {
          const { results, metrics } = await jsonParserPool.runParallelParse([
            transformed.metadata as unknown as string,
            transformed.input as unknown as string,
            transformed.output as unknown as string,
          ]);

          const [metadata, input, output] = results;

          return {
            ...transformed,
            metadata,
            input,
            output,
            optimization: "worker",
            metrics,
          };
        }

        if (query.optimization === "streaming") {
          streamResponse(res, {
            ...transformed,
            optimization: "streaming",
          });
          return {} as any; // Middleware will skip as we did send headers already
        }

        return {
          ...transformed,
          optimization: query.optimization,
        };
      }

      return transformed;
    },
  }),
});
