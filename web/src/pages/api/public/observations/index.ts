import { prisma } from "@langfuse/shared/src/db";

import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";

import {
  GetObservationsV1Query,
  transformDbToApiObservation,
} from "@/src/features/public-api/types/observations";
import {
  generateObservationsForPublicApi,
  getObservationsCountForPublicApi,
} from "@/src/features/public-api/server/observations";
import {
  clickhouseCompliantRandomCharacters,
  replaceIdentifierWithContent,
} from "@langfuse/shared/src/server";
import { InternalServerError } from "@langfuse/shared";
import z from "zod/v4";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Observations",
    querySchema: GetObservationsV1Query,
    responseSchema: z.string(),
    fn: async ({ query, auth, res }) => {
      const filterProps = {
        projectId: auth.scope.projectId,
        page: query.page ?? undefined,
        limit: query.limit ?? undefined,
        traceId: query.traceId ?? undefined,
        userId: query.userId ?? undefined,
        level: query.level ?? undefined,
        name: query.name ?? undefined,
        type: query.type ?? undefined,
        environment: query.environment ?? undefined,
        parentObservationId: query.parentObservationId ?? undefined,
        fromStartTime: query.fromStartTime ?? undefined,
        toStartTime: query.toStartTime ?? undefined,
        version: query.version ?? undefined,
      };
      const [items, count] = await Promise.all([
        generateObservationsForPublicApi(filterProps),
        getObservationsCountForPublicApi(filterProps),
      ]);
      const uniqueModels: string[] = Array.from(
        new Set(
          items
            .map((r) => r.internalModelId)
            .filter((r): r is string => Boolean(r)),
        ),
      );

      const models =
        uniqueModels.length > 0
          ? await prisma.model.findMany({
              where: {
                id: {
                  in: uniqueModels,
                },
                OR: [{ projectId: auth.scope.projectId }, { projectId: null }],
              },
              include: {
                Price: true,
              },
            })
          : [];
      const finalCount = count ? count : 0;

      // Process observations with identifiers for string replacement
      const processedItems = items.map((i) => {
        const model = models.find((m) => m.id === i.internalModelId);

        // Generate unique identifiers for input/output replacement
        const inputIdentifier = clickhouseCompliantRandomCharacters();
        const outputIdentifier = clickhouseCompliantRandomCharacters();

        return {
          ...i,
          input: i.input ? inputIdentifier : null,
          output: i.output ? outputIdentifier : null,
          modelId: model?.id ?? null,
          inputPrice:
            model?.Price?.find((m) => m.usageType === "input")?.price ?? null,
          outputPrice:
            model?.Price?.find((m) => m.usageType === "output")?.price ?? null,
          totalPrice:
            model?.Price?.find((m) => m.usageType === "total")?.price ?? null,
        };
      });

      const apiObservations = processedItems.map(transformDbToApiObservation);

      const returnObject = {
        data: apiObservations,
        meta: {
          page: query.page,
          limit: query.limit,
          totalItems: finalCount,
          totalPages: Math.ceil(finalCount / query.limit),
        },
      };

      // Apply string replacement for all observations
      let stringified = JSON.stringify(returnObject);

      // enrich the observations with the actual input and output

      processedItems.forEach((item) => {
        const obs = items.find((i) => i.id === item.id);
        if (!obs) {
          throw new InternalServerError("Observation not found");
        }

        if (item.input && obs.input) {
          stringified = replaceIdentifierWithContent(
            stringified,
            item.input,
            obs.input,
          );
        }
        if (item.output && obs.output) {
          stringified = replaceIdentifierWithContent(
            stringified,
            item.output,
            obs.output,
          );
        }
      });

      res.setHeader("Content-Type", "application/json");
      return stringified;
    },
  }),
});
