import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import { isValidPostgresRegex } from "@/src/features/models/server/isValidPostgresRegex";
import {
  GetModelResultSchema,
  UpsertModelSchema,
} from "@/src/features/models/validation";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { ModelUsageUnit, paginationZod } from "@langfuse/shared";
import { TRPCError } from "@trpc/server";

const ModelAllOptions = z.object({
  projectId: z.string(),
  ...paginationZod,
});

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
                  JSONB_OBJECT_AGG(usage_type, price)
                FROM
                  prices
                WHERE
                  model_id = m.id
              ),
              '{}'::jsonb
            ) AS prices
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
                  JSONB_OBJECT_AGG(usage_type, price)
                FROM
                  prices
                WHERE
                  model_id = m.id
              ),
              '{}'::jsonb
            ) AS prices
          FROM
            models m
          WHERE
            project_id IS NULL
            OR project_id = ${input.projectId}
          ORDER BY
            project_id,
            model_name,
            m.created_at DESC NULLS LAST 
          LIMIT ${input.limit} OFFSET ${input.page * input.limit};
          `,

        // Total count
        ctx.prisma.$queryRaw<
          {
            count: number;
          }[]
        >`
          SELECT COUNT(DISTINCT (project_id, model_name))
          FROM models
          WHERE project_id IS NULL 
          OR project_id = '${input.projectId}';
        `,
      ]);

      const allModels = z
        .array(GetModelResultSchema)
        .parse(allModelsQueryResult);
      const totalCount = z.coerce.number().parse(totalCountQuery[0].count);

      return {
        models: allModels,
        totalCount,
      };
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

      return await ctx.prisma.$transaction(async (tx) => {
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

        await tx.price.deleteMany({
          where: {
            modelId: upsertedModel.id,
          },
        });

        await tx.price.createMany({
          data: Object.entries(input.prices)
            .filter(
              (priceEntry): priceEntry is [string, number] =>
                priceEntry[1] != null,
            )
            .map(([usageType, price]) => ({
              modelId: upsertedModel.id,
              usageType,
              price,
            })),
        });

        await auditLog({
          session: ctx.session,
          resourceType: "model",
          resourceId: upsertedModel.id,
          action: modelId ? "update" : "create",
          after: upsertedModel,
        });

        return upsertedModel;
      });
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

      return deletedModel;
    }),
});
