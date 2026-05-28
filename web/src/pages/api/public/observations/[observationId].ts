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

export default withMiddlewares(
  {
    GET: createAuthedProjectAPIRoute({
      name: "Get Observation",
      allowInAppAgentKey: true,
      querySchema: GetObservationV1Query,
      responseSchema: GetObservationV1Response,
      rejectInEventsOnlyMode: true,
      fn: async ({ query, auth }) => {
        const clickhouseObservation = query.useEventsTable
          ? await getObservationByIdFromEventsTable({
              id: query.observationId,
              projectId: auth.scope.projectId,
              fetchWithInputOutput: true,
            })
          : await getObservationById({
              id: query.observationId,
              projectId: auth.scope.projectId,
              fetchWithInputOutput: true,
              preferredClickhouseService: "ReadOnly",
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
