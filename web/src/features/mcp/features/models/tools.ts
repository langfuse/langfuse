import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import { clearModelCacheForProject } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { isValidPostgresRegex } from "@/src/features/models/server/isValidPostgresRegex";
import {
  DeleteModelV1Query,
  DeleteModelV1Response,
  GetModelV1Query,
  GetModelV1Response,
  GetModelsV1Query,
  GetModelsV1Response,
  PostModelsV1Body,
  PostModelsV1Response,
  prismaToApiModelDefinition,
} from "@/src/features/public-api/types/models";
import { defineTool } from "../../core/define-tool";
import { runMcpTool } from "../../core/run-mcp-tool";
import { paginationMeta } from "../publicApi";

const modelPricingInclude = {
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
    orderBy: { priority: "asc" as const },
  },
};

export const [listModelsTool, handleListModels] = defineTool({
  name: "listModels",
  description:
    "List custom and Langfuse-managed model definitions visible to the current project.",
  baseSchema: GetModelsV1Query,
  inputSchema: GetModelsV1Query,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.models.list",
      context,
      attributes: {
        "mcp.pagination_page": input.page,
        "mcp.pagination_limit": input.limit,
      },
      fn: async () => {
        const where = {
          OR: [{ projectId: context.projectId }, { projectId: null }],
        };

        const [models, totalItems] = await Promise.all([
          prisma.model.findMany({
            where,
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
            include: modelPricingInclude,
            take: input.limit,
            skip: (input.page - 1) * input.limit,
          }),
          prisma.model.count({ where }),
        ]);

        return GetModelsV1Response.parse({
          data: models.map(prismaToApiModelDefinition),
          meta: paginationMeta({
            page: input.page,
            limit: input.limit,
            totalItems,
          }),
        });
      },
    }),
  readOnlyHint: true,
});

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

export const [getModelTool, handleGetModel] = defineTool({
  name: "getModel",
  description: "Get a model definition by ID from the current project scope.",
  baseSchema: GetModelV1Query,
  inputSchema: GetModelV1Query,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.models.get",
      context,
      attributes: { "mcp.model_id": input.modelId },
      fn: async () => {
        const model = await prisma.model.findFirst({
          where: {
            AND: [
              { id: input.modelId },
              {
                OR: [{ projectId: context.projectId }, { projectId: null }],
              },
            ],
          },
          include: modelPricingInclude,
        });

        if (!model) {
          throw new LangfuseNotFoundError("No model with this id found.");
        }

        return GetModelV1Response.parse(prismaToApiModelDefinition(model));
      },
    }),
  readOnlyHint: true,
});

export const [deleteModelTool, handleDeleteModel] = defineTool({
  name: "deleteModel",
  description:
    "Delete a custom model definition from the current project. Built-in models cannot be deleted.",
  baseSchema: DeleteModelV1Query,
  inputSchema: DeleteModelV1Query,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.models.delete",
      context,
      attributes: { "mcp.model_id": input.modelId },
      fn: async () => {
        const model = await prisma.model.findFirst({
          where: {
            id: input.modelId,
            projectId: context.projectId,
          },
        });

        if (!model) {
          throw new LangfuseNotFoundError(
            "No model with this id found. Note: You cannot delete built-in models, override them with a model with the same name.",
          );
        }

        await prisma.model.delete({
          where: {
            id: input.modelId,
            projectId: context.projectId,
          },
        });

        await auditLog({
          action: "delete",
          resourceType: "model",
          resourceId: input.modelId,
          projectId: context.projectId,
          orgId: context.orgId,
          apiKeyId: context.apiKeyId,
          before: model,
        });

        await clearModelCacheForProject(context.projectId);

        return DeleteModelV1Response.parse({
          message: "Model successfully deleted",
        });
      },
    }),
  destructiveHint: true,
});
