import { InvalidRequestError } from "@langfuse/shared";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import { clearModelCacheForProject } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { isValidPostgresRegex } from "@/src/features/models/server/isValidPostgresRegex";
import {
  PostModelsV1Body,
  PostModelsV1Response,
  prismaToApiModelDefinition,
} from "@/src/features/public-api/types/models";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { modelPricingInclude } from "../schema";

export const [createModelTool, handleCreateModel] = defineTool({
  name: "createModel",
  description:
    "Create a custom model definition for cost tracking/tokenization in the current project.",
  baseSchema: PostModelsV1Body,
  inputSchema: PostModelsV1Body,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.models.create",
      context,
      attributes: { "mcp.model_name": input.modelName },
      fn: async () => {
        const validRegex = await isValidPostgresRegex(
          input.matchPattern,
          prisma,
        );
        if (!validRegex) {
          throw new InvalidRequestError(
            "matchPattern is not a valid regex pattern (Postgres)",
          );
        }

        const { tokenizerConfig, pricingTiers: tierData, ...rest } = input;

        const model = await prisma.$transaction(async (tx) => {
          const existingModelName = await tx.model.findFirst({
            where: {
              projectId: context.projectId,
              modelName: input.modelName,
            },
          });

          if (existingModelName) {
            throw new InvalidRequestError(
              `Model name '${input.modelName}' already exists in project`,
            );
          }

          const createdModel = await tx.model.create({
            data: {
              ...rest,
              tokenizerConfig: tokenizerConfig ?? undefined,
              projectId: context.projectId,
            },
          });

          if (tierData && tierData.length > 0) {
            for (const tier of tierData) {
              const createdTier = await tx.pricingTier.create({
                data: {
                  modelId: createdModel.id,
                  name: tier.name,
                  isDefault: tier.isDefault,
                  priority: tier.priority,
                  conditions: tier.conditions,
                },
              });

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
              { usageType: "input", price: input.inputPrice },
              { usageType: "output", price: input.outputPrice },
              { usageType: "total", price: input.totalPrice },
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
                      price: new Prisma.Decimal(price as number),
                    },
                  }),
                ),
            );
          }

          await auditLog({
            action: "create",
            resourceType: "model",
            resourceId: createdModel.id,
            projectId: context.projectId,
            orgId: context.orgId,
            apiKeyId: context.apiKeyId,
            after: createdModel,
          });

          return createdModel;
        });

        await clearModelCacheForProject(context.projectId);

        const modelWithTiers = await prisma.model.findUnique({
          where: { id: model.id, projectId: context.projectId },
          include: modelPricingInclude,
        });

        if (!modelWithTiers) {
          throw new InvalidRequestError("Failed to fetch created model");
        }

        return PostModelsV1Response.parse(
          prismaToApiModelDefinition(modelWithTiers),
        );
      },
    }),
});
