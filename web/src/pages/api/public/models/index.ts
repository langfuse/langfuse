import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetModelsV1Query,
  GetModelsV1Response,
  PostModelsV1Body,
  PostModelsV1Response,
  prismaToApiModelDefinition,
} from "@/src/features/public-api/types/models";
import { InvalidRequestError } from "@langfuse/shared";
import { isValidPostgresRegex } from "@/src/features/models/server/isValidPostgresRegex";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { type Decimal } from "decimal.js";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
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
        include: {
          Price: {
            select: { usageType: true, price: true },
          },
        },
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

  POST: createAuthedProjectAPIRoute({
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

      const model = await prisma.$transaction(async (tx) => {
        const createdModel = await tx.model.create({
          data: {
            ...rest,
            tokenizerConfig: tokenizerConfig ?? undefined,
            projectId: auth.scope.projectId,
          },
        });

        const prices = [
          { usageType: "input", price: body.inputPrice },
          { usageType: "output", price: body.outputPrice },
          { usageType: "total", price: body.totalPrice },
        ];

        await Promise.all(
          prices
            .filter(({ price }) => price != null)
            .map(({ usageType, price }) =>
              tx.price.create({
                data: {
                  modelId: createdModel.id,
                  projectId: createdModel.projectId,
                  usageType,
                  price: price as number, // type guard checked in array filter
                },
              }),
            ),
        );

        await auditLog({
          action: "create",
          resourceType: "model",
          resourceId: createdModel.id,
          projectId: auth.scope.projectId,
          orgId: auth.scope.orgId,
          apiKeyId: auth.scope.apiKeyId,
          after: createdModel,
        });

        return createdModel;
      });

      return prismaToApiModelDefinition({
        ...model,
        Price: (["inputPrice", "outputPrice", "totalPrice"] as const)
          .filter((key) => model[key] != null)
          .map((key) => ({
            usageType: key.split("Price")[0],
            price: model[key] as Decimal,
          })),
      });
    },
  }),
});
