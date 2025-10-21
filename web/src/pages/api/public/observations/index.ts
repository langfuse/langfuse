import { prisma } from "@langfuse/shared/src/db";
import {
  getObservationsFromEventsTableForPublicApi,
  getObservationsCountFromEventsTableForPublicApi,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";

import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";

import {
  GetObservationsV1Query,
  GetObservationsV1Response,
  transformDbToApiObservation,
} from "@/src/features/public-api/types/observations";
import {
  generateObservationsForPublicApi,
  getObservationsCountForPublicApi,
} from "@/src/features/public-api/server/observations";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Observations",
    querySchema: GetObservationsV1Query,
    responseSchema: GetObservationsV1Response,
    fn: async ({ query, auth }) => {
      const filterProps = {
        projectId: auth.scope.projectId,
        page: query.page,
        limit: query.limit,
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
        advancedFilters: query.filter,
      };

      // Use events table if query parameter is explicitly set, otherwise use environment variable
      const useEventsTable =
        query.useEventsTable !== undefined && query.useEventsTable !== null
          ? query.useEventsTable === true
          : env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS;

      if (useEventsTable) {
        const [items, count] = await Promise.all([
          getObservationsFromEventsTableForPublicApi(filterProps),
          getObservationsCountFromEventsTableForPublicApi(filterProps),
        ]);

        return {
          data: items.map(transformDbToApiObservation),
          meta: {
            page: query.page,
            limit: query.limit,
            totalItems: count,
            totalPages: Math.ceil(count / query.limit),
          },
        };
      }

      // Legacy code path using observations table
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

      return {
        data: items
          .map((i) => {
            const model = models.find((m) => m.id === i.internalModelId);
            return {
              ...i,
              modelId: model?.id ?? null,
              inputPrice:
                model?.Price?.find((m) => m.usageType === "input")?.price ??
                null,
              outputPrice:
                model?.Price?.find((m) => m.usageType === "output")?.price ??
                null,
              totalPrice:
                model?.Price?.find((m) => m.usageType === "total")?.price ??
                null,
            };
          })
          .map(transformDbToApiObservation),
        meta: {
          page: query.page,
          limit: query.limit,
          totalItems: finalCount,
          totalPages: Math.ceil(finalCount / query.limit),
        },
      };
    },
  }),
});
