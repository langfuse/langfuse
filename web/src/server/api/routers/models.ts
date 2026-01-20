import { v4 as uuidv4 } from "uuid";
import { z } from "zod/v4";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import { isValidPostgresRegex } from "@/src/features/models/server/isValidPostgresRegex";
import {
  GetModelResultSchema,
  ModelLastUsedQueryResult,
  UpsertModelSchema,
} from "@/src/features/models/validation";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { ModelUsageUnit, paginationZod, Prisma } from "@langfuse/shared";
import {
  clearModelCacheForProject,
  queryClickhouse,
  findModel,
  matchPricingTier,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";

const ModelAllOptions = z.object({
  projectId: z.string(),
  searchString: z.string(),
  ...paginationZod,
});

const paginateArray = <T>(params: {
  limit: number;
  page: number;
  data: Array<T>;
}): Array<T> => {
  const { data, limit, page } = params;
  const startIndex = limit * page;
  const endIndex = startIndex + limit;

  return data.slice(startIndex, endIndex);
};

export const modelRouter = createTRPCRouter({
  getById: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), modelId: z.string() }))
    .query(async ({ input, ctx }) => {
      const modelQueryResult = await ctx.prisma.$queryRaw`
          SELECT
            m.id,
            m.project_id as "projectId",
            m.model_name as "modelName",
            m.match_pattern as "matchPattern",
            m.tokenizer_config as "tokenizerConfig",
            m.tokenizer_id as "tokenizerId",
            COALESCE(
              (
                SELECT
                  JSON_AGG(
                    JSON_BUILD_OBJECT(
                      'id', mpt.id,
                      'name', mpt.name,
                      'isDefault', mpt.is_default,
                      'priority', mpt.priority,
                      'conditions', mpt.conditions,
                      'prices', COALESCE(
                        (
                          SELECT
                            JSONB_OBJECT_AGG(p.usage_type, p.price)
                          FROM
                            prices p
                          WHERE
                            p.pricing_tier_id = mpt.id
                        ),
                        '{}'::jsonb
                      )
                    )
                    ORDER BY mpt.priority ASC
                  )
                FROM
                  pricing_tiers mpt
                WHERE
                  mpt.model_id = m.id
              ),
              '[]'::json
            ) AS "pricingTiers"
          FROM
            models m
          WHERE
            m.id = ${input.modelId}
            AND (
              project_id IS NULL
              OR project_id = ${input.projectId}
            );
      `;

      const model = z.array(GetModelResultSchema).parse(modelQueryResult)[0];

      if (!model || (model.projectId && model.projectId !== input.projectId)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Model not found",
        });
      }

      return model;
    }),

  getAll: protectedProjectProcedure
    .input(ModelAllOptions)
    .query(async ({ input, ctx }) => {
      const { projectId, page, limit, searchString } = input;

      const searchStringTemplate = `%${searchString}%`;
      const searchStringCondition = searchString
        ? Prisma.sql`AND model_name ILIKE ${searchStringTemplate}`
        : Prisma.sql`AND 1=1`;

      const [allModelsQueryResult, totalCountQuery] = await Promise.all([
        // All models
        ctx.prisma.$queryRaw`
          SELECT DISTINCT ON (project_id, model_name)
            m.id,
            m.project_id as "projectId",
            m.model_name as "modelName",
            m.match_pattern as "matchPattern",
            m.tokenizer_config as "tokenizerConfig",
            m.tokenizer_id as "tokenizerId",
            COALESCE(
              (
                SELECT
                  JSON_AGG(
                    JSON_BUILD_OBJECT(
                      'id', mpt.id,
                      'name', mpt.name,
                      'isDefault', mpt.is_default,
                      'priority', mpt.priority,
                      'conditions', mpt.conditions,
                      'prices', COALESCE(
                        (
                          SELECT
                            JSONB_OBJECT_AGG(p.usage_type, p.price)
                          FROM
                            prices p
                          WHERE
                            p.pricing_tier_id = mpt.id
                        ),
                        '{}'::jsonb
                      )
                    )
                    ORDER BY mpt.priority ASC
                  )
                FROM
                  pricing_tiers mpt
                WHERE
                  mpt.model_id = m.id
              ),
              '[]'::json
            ) AS "pricingTiers"
          FROM
            models m
          WHERE
            (project_id IS NULL OR project_id = ${projectId})
			      ${searchStringCondition}
          ORDER BY
            project_id,
            model_name,
            m.created_at DESC NULLS LAST
          `,

        // Total count
        ctx.prisma.$queryRaw<
          {
            count: number;
          }[]
        >`
          SELECT COUNT(DISTINCT (project_id, model_name))
          FROM models
          WHERE (project_id IS NULL OR project_id = ${projectId})
          ${searchStringCondition};
        `,
      ]);

      const allModels = z
        .array(GetModelResultSchema)
        .parse(allModelsQueryResult);
      const totalCount = z.coerce.number().parse(totalCountQuery[0].count);

      return {
        models: paginateArray({ data: allModels, page, limit }),
        totalCount,
      };
    }),

  lastUsedByModelIds: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        modelIds: z.array(z.string()),
      }),
    )
    .query(async ({ input }) => {
      const { projectId, modelIds } = input;

      if (modelIds.length === 0) return {};

      const lastUsedQuery = `
        SELECT
          internal_model_id as modelId,
          MAX(start_time) as lastUsed
        FROM observations
        WHERE project_id = {projectId: String}
          AND type = 'GENERATION'
          AND internal_model_id IN ({modelIds: Array(String)})
        GROUP BY internal_model_id
      `;

      const result = ModelLastUsedQueryResult.safeParse(
        await queryClickhouse({
          query: lastUsedQuery,
          params: { projectId, modelIds },
        }),
      );

      if (!result.success) return {};

      return result.data.reduce(
        (acc, { modelId, lastUsed }) => {
          acc[modelId] = lastUsed;

          return acc;
        },
        {} as Record<string, Date>,
      );
    }),

  upsert: protectedProjectProcedure
    .input(UpsertModelSchema)
    .mutation(async ({ input, ctx }) => {
      const {
        modelId: providedModelId,
        projectId,
        modelName,
        matchPattern,
        tokenizerConfig,
        tokenizerId,
        pricingTiers,
      } = input;

      throwIfNoProjectAccess({
        session: ctx.session,
        projectId,
        scope: "models:CUD",
      });

      // Check if regex is valid POSIX regex
      // Use DB to check, because JS regex is not POSIX compliant
      const isValidRegex = await isValidPostgresRegex(
        input.matchPattern,
        ctx.prisma,
      );
      if (!isValidRegex) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid regex, needs to be Postgres syntax",
        });
      }

      const modelId = providedModelId ?? uuidv4();

      const result = await ctx.prisma.$transaction(async (tx) => {
        // Check whether model belongs to project
        // This check is important to prevent users from updating prices for models that they do not have access to
        const existingModel = await tx.model.findUnique({
          where: {
            id: modelId,
          },
        });

        if (existingModel && existingModel.projectId !== projectId) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Model not found",
          });
        }

        // Check if model name is unique within the project
        // Note: The database has a uniqueness constraint on (projectId, modelName, startDate, unit),
        // but this constraint is not enforced when startDate or unit are NULL.
        // We do an explicit check here to ensure uniqueness on just (projectId, modelName).
        // TODO(LFE-3229): After models table cleanup, enforce uniqueness constraint directly on (projectId, modelName)
        const existingModelName = await tx.model.findFirst({
          where: {
            projectId,
            modelName,
          },
        });

        if (existingModelName && modelId !== existingModelName.id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Model name '${modelName}' already exists in project`,
          });
        }

        const upsertedModel = await tx.model.upsert({
          where: {
            id: modelId,
            projectId: projectId,
          },
          create: {
            id: modelId,
            projectId,
            modelName,
            matchPattern,
            tokenizerConfig,
            tokenizerId,
            startDate: new Date("2010-01-01"), // Set fix start date for uniqueness constraint to work. TODO: drop after cleanup of models table in LFE-3229
            unit: ModelUsageUnit.Tokens, // Set fix unit for uniqueness constraint to work. TODO: drop after cleanup of models table in LFE-3229
          },
          update: {
            matchPattern,
            tokenizerConfig,
            tokenizerId,
          },
        });

        // Delete all existing pricing tiers
        await tx.pricingTier.deleteMany({
          where: {
            modelId: upsertedModel.id,
          },
        });

        // Create new pricing tiers
        for (const tier of pricingTiers) {
          const createdTier = await tx.pricingTier.create({
            data: {
              modelId: upsertedModel.id,
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
                  modelId: upsertedModel.id,
                  projectId: upsertedModel.projectId,
                  pricingTierId: createdTier.id,
                  usageType,
                  price,
                },
              }),
            ),
          );
        }

        await auditLog({
          session: ctx.session,
          resourceType: "model",
          resourceId: upsertedModel.id,
          action: providedModelId ? "update" : "create",
          after: { model: upsertedModel, pricingTiers },
        });

        return upsertedModel;
      });

      // Clear model cache for the project after successful upsert
      await clearModelCacheForProject(projectId);

      return result;
    }),
  delete: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        modelId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "models:CUD",
      });

      const deletedModel = await ctx.prisma.model.delete({
        where: {
          id: input.modelId,
          projectId: input.projectId,
        },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "model",
        resourceId: input.modelId,
        action: "delete",
        before: deletedModel,
      });

      // Clear model cache for the project after successful deletion
      await clearModelCacheForProject(input.projectId);

      return deletedModel;
    }),
  testMatch: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        modelName: z.string().min(1),
        usageDetails: z.record(z.string(), z.number()).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { projectId, modelName, usageDetails } = input;

      throwIfNoProjectAccess({
        session: ctx.session,
        projectId,
        scope: "models:CUD",
      });

      // Step 1: Use existing findModel from shared
      const { model, pricingTiers } = await findModel({
        projectId,
        model: modelName,
      });

      if (!model) {
        return { matched: false as const };
      }

      // Step 2: If no usage details provided, return default tier
      if (!usageDetails || Object.keys(usageDetails).length === 0) {
        const defaultTier = pricingTiers.find((t) => t.isDefault);
        if (!defaultTier) {
          return { matched: false as const };
        }

        return {
          matched: true as const,
          model: {
            id: model.id,
            modelName: model.modelName,
            matchPattern: model.matchPattern,
            projectId: model.projectId,
          },
          matchedTier: {
            id: defaultTier.id,
            name: defaultTier.name,
            priority: defaultTier.priority,
            isDefault: true,
            prices: Object.fromEntries(
              defaultTier.prices.map((p) => [p.usageType, p.price.toNumber()]),
            ),
          },
        };
      }

      // Step 3: Use matchPricingTier from shared
      const matchResult = matchPricingTier(pricingTiers, usageDetails);

      if (!matchResult) {
        return { matched: false as const };
      }

      // Step 4: Find the full tier details
      const matchedTier = pricingTiers.find(
        (t) => t.id === matchResult.pricingTierId,
      );
      if (!matchedTier) {
        return { matched: false as const };
      }

      return {
        matched: true as const,
        model: {
          id: model.id,
          modelName: model.modelName,
          matchPattern: model.matchPattern,
          projectId: model.projectId,
        },
        matchedTier: {
          id: matchedTier.id,
          name: matchedTier.name,
          priority: matchedTier.priority,
          isDefault: matchedTier.isDefault,
          prices: Object.fromEntries(
            matchedTier.prices.map((p) => [p.usageType, p.price.toNumber()]),
          ),
        },
      };
    }),
});
