import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import {
  GetModelsV1Query,
  GetModelsV1Response,
  PostModelsV1Body,
  PostModelsV1Response,
  prismaToApiModelDefinition,
} from "@/src/features/public-api/types/models";
import { InvalidRequestError } from "@langfuse/shared";
import { isValidPostgresRegex } from "@/src/features/models/server/isValidPostgresRegex";

export default withMiddlewares({
  GET: createAuthedAPIRoute({
    name: "Get model definitions",
    querySchema: GetModelsV1Query,
    responseSchema: GetModelsV1Response,
    fn: async ({ query, auth }) => {
      const models = await prisma.model.findMany({
        where: {
          OR: [
            {
              projectId: auth.scope.projectId,
            },
            {
              projectId: null,
            },
          ],
        },
        orderBy: [
          { modelName: "asc" },
          { unit: "asc" },
          {
            startDate: {
              sort: "desc",
              nulls: "last",
            },
          },
        ],
        take: query.limit,
        skip: (query.page - 1) * query.limit,
      });

      const totalItems = await prisma.model.count({
        where: {
          OR: [
            {
              projectId: auth.scope.projectId,
            },
            {
              projectId: null,
            },
          ],
        },
      });

      return {
        data: models.map(prismaToApiModelDefinition),
        meta: {
          page: query.page,
          limit: query.limit,
          totalItems,
          totalPages: Math.ceil(totalItems / query.limit),
        },
      };
    },
  }),
  POST: createAuthedAPIRoute({
    name: "Create custom model definition",
    bodySchema: PostModelsV1Body,
    responseSchema: PostModelsV1Response,
    fn: async ({ body, auth }) => {
      const validRegex = await isValidPostgresRegex(body.matchPattern, prisma);
      if (!validRegex) {
        throw new InvalidRequestError(
          "matchPattern is not a valid regex pattern (Postgres)",
        );
      }
      const { tokenizerConfig, ...rest } = body;
      const model = await prisma.model.create({
        data: {
          ...rest,
          tokenizerConfig: tokenizerConfig ?? undefined,
          projectId: auth.scope.projectId,
        },
      });
      return prismaToApiModelDefinition(model);
    },
  }),
});
