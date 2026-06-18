import { prisma } from "@langfuse/shared/src/db";
import {
  getObservationsFromEventsTableForPublicApi,
  getObservationsCountFromEventsTableForPublicApi,
} from "@langfuse/shared/src/server";

import {
  LEGACY_PUBLIC_API_OBSERVATIONS_CLICKHOUSE_RESOURCE_ERROR_MESSAGE,
  withMiddlewares,
} from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { env } from "@/src/env.mjs";

import {
  GetObservationsV1Query,
  GetObservationsV1Response,
  transformDbToApiObservation,
} from "@/src/features/public-api/types/observations";
import {
  generateObservationsForPublicApi,
  getObservationsCountForPublicApi,
} from "@/src/features/public-api/server/observations";

export default withMiddlewares(
  {
    GET: createAuthedProjectAPIRoute({
      name: "Get Observations",
      allowInAppAgentKey: true,
      // Only surface the migration hint where v4 APIs are enabled; the v4
      // preview opt-in gates the v2 surface. Keep this dormant otherwise so we
      // never point callers at an endpoint that is not yet reachable.
      rateLimitMigrationMessage:
        env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true"
          ? "Migrate to the v2/traces endpoint (GET /api/public/v2/traces) for improved performance and higher rate limits. Learn more at https://langfuse.com/docs/v4"
          : undefined,
      querySchema: GetObservationsV1Query,
      responseSchema: GetObservationsV1Response,
      rejectInEventsOnlyMode: true,
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

        if (query.useEventsTable) {
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
                  OR: [
                    { projectId: auth.scope.projectId },
                    { projectId: null },
                  ],
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
  },
  {
    clickHouseResourceErrorMessage:
      LEGACY_PUBLIC_API_OBSERVATIONS_CLICKHOUSE_RESOURCE_ERROR_MESSAGE,
  },
);
