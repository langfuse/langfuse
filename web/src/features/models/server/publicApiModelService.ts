import { auditLog } from "@/src/features/audit-logs/auditLog";
import { isValidPostgresRegex } from "@/src/features/models/server/isValidPostgresRegex";
import type {
  DeleteModelV1Query,
  GetModelV1Query,
  GetModelsV1Query,
  PostModelsV1Body,
} from "@/src/features/public-api/types/models";
import { prismaToApiModelDefinition } from "@/src/features/public-api/types/models";
import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import { clearModelCacheForProject } from "@langfuse/shared/src/server";
import type { z } from "zod";

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

type ModelAuditScope = {
  projectId: string;
  orgId: string;
  apiKeyId: string;
};

type ListModelsInput = z.infer<typeof GetModelsV1Query> & {
  projectId: string;
};

type GetModelInput = z.infer<typeof GetModelV1Query> & {
  projectId: string;
};

type CreateModelInput = {
  projectId: string;
  input: z.infer<typeof PostModelsV1Body>;
  auditScope: ModelAuditScope;
};

type DeleteModelInput = z.infer<typeof DeleteModelV1Query> & ModelAuditScope;

const visibleModelsWhere = (projectId: string) => ({
  OR: [{ projectId }, { projectId: null }],
});

export const listModelsForApi = async ({
  projectId,
  page,
  limit,
}: ListModelsInput) => {
  const where = visibleModelsWhere(projectId);

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
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.model.count({ where }),
  ]);

  return {
    data: models.map(prismaToApiModelDefinition),
    meta: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

export const getModelForApi = async ({ projectId, modelId }: GetModelInput) => {
  const model = await prisma.model.findFirst({
    where: {
      AND: [{ id: modelId }, visibleModelsWhere(projectId)],
    },
    include: modelPricingInclude,
  });

  if (!model) {
    throw new LangfuseNotFoundError("No model with this id found.");
  }

  return prismaToApiModelDefinition(model);
};

export const createModelForApi = async ({
  projectId,
  input,
  auditScope,
}: CreateModelInput) => {
  const validRegex = await isValidPostgresRegex(input.matchPattern, prisma);
  if (!validRegex) {
    throw new InvalidRequestError(
      "matchPattern is not a valid regex pattern (Postgres)",
    );
  }

  const { tokenizerConfig, pricingTiers: tierData, ...rest } = input;

  const model = await prisma.$transaction(async (tx) => {
    const existingModelName = await tx.model.findFirst({
      where: {
        projectId,
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
        projectId,
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
      projectId: auditScope.projectId,
      orgId: auditScope.orgId,
      apiKeyId: auditScope.apiKeyId,
      after: createdModel,
    });

    return createdModel;
  });

  await clearModelCacheForProject(projectId);

  const modelWithTiers = await prisma.model.findUnique({
    where: { id: model.id, projectId },
    include: modelPricingInclude,
  });

  if (!modelWithTiers) {
    throw new InvalidRequestError("Failed to fetch created model");
  }

  return prismaToApiModelDefinition(modelWithTiers);
};

export const deleteModelForApi = async ({
  projectId,
  orgId,
  apiKeyId,
  modelId,
}: DeleteModelInput) => {
  const model = await prisma.model.findFirst({
    where: {
      id: modelId,
      projectId,
    },
  });

  if (!model) {
    throw new LangfuseNotFoundError(
      "No model with this id found. Note: You cannot delete built-in models, override them with a model with the same name.",
    );
  }

  await prisma.model.delete({
    where: {
      id: modelId,
      projectId,
    },
  });

  await auditLog({
    action: "delete",
    resourceType: "model",
    resourceId: modelId,
    projectId,
    orgId,
    apiKeyId,
    before: model,
  });

  await clearModelCacheForProject(projectId);

  return {
    message: "Model successfully deleted" as const,
  };
};
