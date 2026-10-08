import { z } from "zod";
import {
  CreateLlmApiKey,
  UpdateLlmApiKey,
} from "@/src/features/llm-api-key/types";
import { throwIfNoProjectAccess } from "@/src/features/rbac";
import {
  createTRPCRouter,
  protectedProjectProcedure,
  protectedProjectProcedureWithoutTracing,
} from "@/src/server/api/trpc";
import { LlmConnectionService } from "./llmConnectionService";

export const llmApiKeyRouter = createTRPCRouter({
  create: protectedProjectProcedureWithoutTracing
    .input(CreateLlmApiKey)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "llmApiKeys:create",
      });
      const { projectId, ...connectionInput } = input;
      return new LlmConnectionService().create({
        owner: {
          type: "project",
          projectId,
          organizationId: ctx.session.orgId,
        },
        input: connectionInput,
        actor: { session: ctx.session },
      });
    }),
  delete: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        id: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "llmApiKeys:delete",
      });
      await new LlmConnectionService().delete({
        owner: {
          type: "project",
          projectId: input.projectId,
          organizationId: ctx.session.orgId,
        },
        id: input.id,
        actor: { session: ctx.session },
      });
      return { success: true };
    }),
  all: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        includeDecisionModels: z.boolean().optional().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "llmApiKeys:read",
      });
      return new LlmConnectionService().list({
        owner: {
          type: "project",
          projectId: input.projectId,
          organizationId: ctx.session.orgId,
        },
        includeDecisionModels: input.includeDecisionModels,
      });
    }),

  test: protectedProjectProcedureWithoutTracing
    .input(CreateLlmApiKey)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "llmApiKeys:create",
      });
      const { projectId: _projectId, ...connectionInput } = input;
      return new LlmConnectionService().test(connectionInput);
    }),

  testUpdate: protectedProjectProcedureWithoutTracing
    .input(UpdateLlmApiKey)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "llmApiKeys:update",
      });
      const { projectId, ...connectionInput } = input;
      return new LlmConnectionService().testUpdate({
        owner: {
          type: "project",
          projectId,
          organizationId: ctx.session.orgId,
        },
        input: connectionInput,
      });
    }),

  update: protectedProjectProcedureWithoutTracing
    .input(UpdateLlmApiKey)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "llmApiKeys:update",
      });
      const { projectId, ...connectionInput } = input;
      return new LlmConnectionService().update({
        owner: {
          type: "project",
          projectId,
          organizationId: ctx.session.orgId,
        },
        input: connectionInput,
        actor: { session: ctx.session },
      });
    }),
});
