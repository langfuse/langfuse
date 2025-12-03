import { prisma, Prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { clearModelCacheForProject } from "@langfuse/shared/src/server";
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
          pricingTiers: {
            select: {
              id: true,
              name: true,
              isDefault: true,
              priority: true,
              conditions: true,
              prices: {
                select: {
                  usageType: true,
                  price: true,
                },
              },
            },
            orderBy: { priority: "asc" },
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
      const { tokenizerConfig, pricingTiers: tierData, ...rest } = body;

      const model = await prisma.$transaction(async (tx) => {
        const existingModelName = await tx.model.findFirst({
          where: {
            projectId: auth.scope.projectId,
            modelName: body.modelName,
          },
        });

        if (existingModelName) {
          throw new InvalidRequestError(
            `Model name '${body.modelName}' already exists in project`,
          );
        }

        // 1. Create model
        const createdModel = await tx.model.create({
          data: {
            ...rest,
            tokenizerConfig: tokenizerConfig ?? undefined,
            projectId: auth.scope.projectId,
          },
        });

        // 2. Handle pricing: flat prices OR pricing tiers
        if (tierData && tierData.length > 0) {
          // NEW: Create pricing tiers
          for (const tier of tierData) {
            // Create tier (Prisma generates CUID)
            const createdTier = await tx.pricingTier.create({
              data: {
                modelId: createdModel.id,
                name: tier.name,
                isDefault: tier.isDefault,
                priority: tier.priority,
                conditions: tier.conditions,
              },
            });

            // Create prices for this tier
            await Promise.all(
              Object.entries(tier.prices).map(([usageType, price]) =>
                tx.price.create({
                  data: {
                    modelId: createdModel.id,
                    projectId: createdModel.projectId,
                    pricingTierId: createdTier.id,
                    usageType,
                    price: new Prisma.Decimal(price),
                  },
                }),
              ),
            );
          }
        } else {
          // BACKWARD COMPATIBLE: Create default tier from flat prices
          const defaultTierId = `${createdModel.id}_tier_default`;

          const defaultTier = await tx.pricingTier.create({
            data: {
              id: defaultTierId,
              modelId: createdModel.id,
              name: "Standard",
              isDefault: true,
              priority: 0,
              conditions: [],
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
                    pricingTierId: defaultTier.id,
                    usageType,
                    price: new Prisma.Decimal(price as number), // type guard checked in array filter
                  },
                }),
              ),
          );
        }

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

      // Clear model cache for the project after successful creation
      await clearModelCacheForProject(auth.scope.projectId);

      // Fetch the created model with pricingTiers relation
      const modelWithTiers = await prisma.model.findUnique({
        where: { id: model.id },
        include: {
          pricingTiers: {
            select: {
              id: true,
              name: true,
              isDefault: true,
              priority: true,
              conditions: true,
              prices: {
                select: {
                  usageType: true,
                  price: true,
                },
              },
            },
            orderBy: { priority: "asc" },
          },
        },
      });

      if (!modelWithTiers) {
        throw new InvalidRequestError("Failed to fetch created model");
      }

      return prismaToApiModelDefinition(modelWithTiers);
    },
  }),
});
