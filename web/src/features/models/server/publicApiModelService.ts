import { auditLog } from "@/src/features/audit-logs/auditLog";
import { isValidPostgresRegex } from "@/src/features/models/server/isValidPostgresRegex";
import {
  type DeleteModelV1Query,
  type GetModelV1Query,
  type GetModelsV1Query,
  type PostModelsV1Body,
  prismaToApiModelDefinition,
} from "@/src/features/public-api/server";
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

type UpsertModelInput = z.infer<typeof GetModelV1Query> & {
  projectId: string;
  input: z.infer<typeof PostModelsV1Body>;
  auditScope: ModelAuditScope;
};

type DeleteModelInput = z.infer<typeof DeleteModelV1Query> & ModelAuditScope;

const visibleModelsWhere = (projectId: string) => ({
  OR: [{ projectId }, { projectId: null }],
});

const createModelPricing = async ({
  tx,
  model,
  input,
}: {
  tx: Prisma.TransactionClient;
  model: { id: string; projectId: string | null };
  input: z.infer<typeof PostModelsV1Body>;
}) => {
  const tierData = input.pricingTiers;

  if (tierData && tierData.length > 0) {
    for (const tier of tierData) {
      const createdTier = await tx.pricingTier.create({
        data: {
          modelId: model.id,
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
              modelId: model.id,
              projectId: model.projectId,
              pricingTierId: createdTier.id,
              usageType,
              price: new Prisma.Decimal(price),
            },
          }),
        ),
      );
    }

    return;
  }

  const defaultTier = await tx.pricingTier.create({
    data: {
      id: `${model.id}_tier_default`,
      modelId: model.id,
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
    prices.map(async ({ usageType, price }) => {
      if (price == null) return;

      await tx.price.create({
        data: {
          modelId: model.id,
          projectId: model.projectId,
          pricingTierId: defaultTier.id,
          usageType,
          price: new Prisma.Decimal(price),
        },
      });
    }),
  );
};

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

  const { tokenizerConfig, pricingTiers: _pricingTiers, ...rest } = input;

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

    // 1. Create model
    const createdModel = await tx.model.create({
      data: {
        ...rest,
        tokenizerConfig: tokenizerConfig ?? undefined,
        projectId,
      },
    });

    await createModelPricing({ tx, model: createdModel, input });

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

  // Clear model cache for the project after successful creation
  await clearModelCacheForProject(projectId);

  // Fetch the created model with pricingTiers relation
  const modelWithTiers = await prisma.model.findUnique({
    where: { id: model.id, projectId },
    include: modelPricingInclude,
  });

  if (!modelWithTiers) {
    throw new InvalidRequestError("Failed to fetch created model");
  }

  return prismaToApiModelDefinition(modelWithTiers);
};

export const upsertModelForApi = async ({
  projectId,
  modelId,
  input,
  auditScope,
}: UpsertModelInput) => {
  const validRegex = await isValidPostgresRegex(input.matchPattern, prisma);
  if (!validRegex) {
    throw new InvalidRequestError(
      "matchPattern is not a valid regex pattern (Postgres)",
    );
  }

  const modelWithTiers = await prisma.$transaction(async (tx) => {
    const existingModel = await tx.model.findUnique({
      where: { id: modelId },
      include: modelPricingInclude,
    });

    if (existingModel && existingModel.projectId !== projectId) {
      throw new LangfuseNotFoundError("No model with this id found.");
    }

    const duplicateModelName = await tx.model.findFirst({
      where: {
        projectId,
        modelName: input.modelName,
        NOT: { id: modelId },
      },
    });

    if (duplicateModelName) {
      throw new InvalidRequestError(
        `Model name '${input.modelName}' already exists in project`,
      );
    }

    const modelData = {
      modelName: input.modelName,
      matchPattern: input.matchPattern,
      startDate: input.startDate ?? null,
      inputPrice: input.inputPrice ?? null,
      outputPrice: input.outputPrice ?? null,
      totalPrice: input.totalPrice ?? null,
      unit: input.unit,
      tokenizerId: input.tokenizerId ?? null,
      tokenizerConfig: input.tokenizerConfig ?? Prisma.DbNull,
    };

    const upsertedModel = await tx.model.upsert({
      where: { id: modelId },
      create: {
        id: modelId,
        projectId,
        ...modelData,
      },
      update: modelData,
    });

    await tx.pricingTier.deleteMany({
      where: { modelId: upsertedModel.id },
    });
    await createModelPricing({ tx, model: upsertedModel, input });

    const upsertedModelWithTiers = await tx.model.findUnique({
      where: { id: upsertedModel.id, projectId },
      include: modelPricingInclude,
    });

    if (!upsertedModelWithTiers) {
      throw new InvalidRequestError("Failed to fetch upserted model");
    }

    await auditLog({
      action: existingModel ? "update" : "create",
      resourceType: "model",
      resourceId: upsertedModel.id,
      projectId: auditScope.projectId,
      orgId: auditScope.orgId,
      apiKeyId: auditScope.apiKeyId,
      before: existingModel ?? undefined,
      after: upsertedModelWithTiers,
    });

    return upsertedModelWithTiers;
  });

  await clearModelCacheForProject(projectId);

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

  // Clear model cache for the project after successful deletion
  await clearModelCacheForProject(projectId);

  return {
    message: "Model successfully deleted" as const,
  };
};
