import { prisma } from "@langfuse/shared/src/db";
import {
  GetObservationV1Query,
  GetObservationV1Response,
  transformDbToApiObservation,
} from "@/src/features/public-api/types/observations";
import {
  LEGACY_PUBLIC_API_OBSERVATIONS_CLICKHOUSE_RESOURCE_ERROR_MESSAGE,
  withMiddlewares,
} from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { LangfuseNotFoundError } from "@langfuse/shared";
import {
  enrichObservationWithModelData,
  getObservationById,
  getObservationByIdFromEventsTable,
} from "@langfuse/shared/src/server";
import { legacyPublicApiRateLimitUpgradePaths } from "@/src/features/public-api/server/rateLimitUpgradePaths";
import { OBSERVATIONS_V1_DEPRECATION } from "@/src/features/public-api/server/deprecations";

export default withMiddlewares(
  {
    GET: createAuthedProjectAPIRoute({
      name: "Get Observation",
      audit: {
        route: "GET /api/public/observations/{observationId}",
        resourceType: "observation",
        action: "read",
        resourceId: (query) => query.observationId,
      },
      action: "traces:read",
      allowInAppAgentKey: true,
      rateLimitResource: "public-api-legacy",
      querySchema: GetObservationV1Query,
      responseSchema: GetObservationV1Response,
      rateLimitUpgradePath: legacyPublicApiRateLimitUpgradePaths.observationGet,
      rejectInEventsOnlyMode: true,
      deprecation: OBSERVATIONS_V1_DEPRECATION,
      fn: async ({ query, auth }) => {
        const startTime = query.startTime
          ? new Date(query.startTime)
          : undefined;

        const lookupObservation = (withStartTime: boolean) =>
          query.useEventsTable
            ? getObservationByIdFromEventsTable({
                id: query.observationId,
                projectId: auth.scope.projectId,
                fetchWithInputOutput: true,
                startTime: withStartTime ? startTime : undefined,
              })
            : // eslint-disable-next-line @typescript-eslint/no-deprecated
              getObservationById({
                id: query.observationId,
                projectId: auth.scope.projectId,
                fetchWithInputOutput: true,
                startTime: withStartTime ? startTime : undefined,
                preferredClickhouseService: "ReadOnly",
              });

        // startTime is a performance hint: it bounds the lookup to its minute so
        // ClickHouse can prune parts/partitions. On a miss we retry unbounded,
        // so a wrong or stale hint only ever costs speed, never correctness.
        let clickhouseObservation;
        try {
          clickhouseObservation = await lookupObservation(true);
        } catch (e) {
          if (!(e instanceof LangfuseNotFoundError) || !startTime) throw e;
          clickhouseObservation = await lookupObservation(false);
        }

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
                Price: {
                  where: { pricingTier: { isDefault: true } },
                },
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
          ...enrichObservationWithModelData(model),
        };

        if (!observation) {
          throw new LangfuseNotFoundError(
            "Observation not found within authorized project",
          );
        }
        return transformDbToApiObservation(observation);
      },
    }),
  },
  {
    clickHouseResourceErrorMessage:
      LEGACY_PUBLIC_API_OBSERVATIONS_CLICKHOUSE_RESOURCE_ERROR_MESSAGE,
  },
);
