import { z } from "zod";

import { queryClickhouse } from "@langfuse/shared/src/server";
import {
  deleteModelDefinition,
  getModelDefinition,
  listModelDefinitions,
  testModelDefinitionMatch,
  upsertModelDefinition,
} from "@/src/features/models/server/modelDefinitionService";
import {
  ModelLastUsedQueryResult,
  TestModelMatchInputSchema,
  UpsertModelSchema,
} from "@/src/features/models/validation";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { paginationZod } from "@langfuse/shared";

export const modelRouter = createTRPCRouter({
  getById: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), modelId: z.string() }))
    .query(({ input }) =>
      getModelDefinition({
        owner: { type: "project", projectId: input.projectId },
        modelId: input.modelId,
      }),
    ),

  getAll: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        searchString: z.string(),
        ...paginationZod,
      }),
    )
    .query(({ input }) =>
      listModelDefinitions({
        owner: { type: "project", projectId: input.projectId },
        searchString: input.searchString,
        // The table's page index starts at 0.
        page: input.page + 1,
        limit: input.limit,
      }),
    ),

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
    .mutation(({ input, ctx }) => {
      const { projectId, ...modelInput } = input;
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId,
        scope: "models:CUD",
      });

      return upsertModelDefinition({
        owner: { type: "project", projectId },
        actor: { session: ctx.session },
        input: modelInput,
      });
    }),

  delete: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), modelId: z.string() }))
    .mutation(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "models:CUD",
      });

      return deleteModelDefinition({
        owner: { type: "project", projectId: input.projectId },
        actor: { session: ctx.session },
        modelId: input.modelId,
      });
    }),

  testMatch: protectedProjectProcedure
    .input(TestModelMatchInputSchema.extend({ projectId: z.string() }))
    .query(({ input, ctx }) => {
      const { projectId, ...matchInput } = input;
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId,
        scope: "models:CUD",
      });

      return testModelDefinitionMatch({
        owner: { type: "project", projectId },
        ...matchInput,
      });
    }),
});
