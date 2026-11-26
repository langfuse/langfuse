import { z } from "zod";
import {
  CreateLlmApiKey,
  UpdateLlmApiKey,
} from "@/src/features/llm-api-key/types";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
  protectedProjectProcedureWithoutTracing,
} from "@/src/server/api/trpc";
import {
  getBedrockCrossAccountRoleArn,
  getBedrockExternalId,
  getBedrockIamRoleAccess,
} from "./bedrockIamRoleAccess";
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
      const { projectId, bedrockExternalIdNonce, ...connectionInput } = input;
      await new LlmConnectionService().create({
        owner: {
          type: "project",
          projectId,
          organizationId: ctx.session.orgId,
        },
        input: connectionInput,
        actor: { session: ctx.session },
        bedrockIamRole: getBedrockIamRoleAccess({
          sessionUser: ctx.session.user,
          owner: { type: "project", projectId },
          externalIdNonce: bedrockExternalIdNonce,
        }),
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

  inherited: protectedProjectProcedure
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
      return new LlmConnectionService().listInherited({
        owner: {
          type: "project",
          projectId: input.projectId,
          organizationId: ctx.session.orgId,
        },
        includeDecisionModels: input.includeDecisionModels,
      });
    }),

  effective: protectedProjectProcedure
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
      return new LlmConnectionService().listEffective({
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
      const { projectId, bedrockExternalIdNonce, ...connectionInput } = input;
      return new LlmConnectionService().test(connectionInput, {
        bedrockIamRole: getBedrockIamRoleAccess({
          sessionUser: ctx.session.user,
          owner: { type: "project", projectId },
          externalIdNonce: bedrockExternalIdNonce,
        }),
      });
    }),

  testUpdate: protectedProjectProcedureWithoutTracing
    .input(UpdateLlmApiKey)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "llmApiKeys:update",
      });
      const { projectId, bedrockExternalIdNonce, ...connectionInput } = input;
      return new LlmConnectionService().testUpdate({
        owner: {
          type: "project",
          projectId,
          organizationId: ctx.session.orgId,
        },
        input: connectionInput,
        bedrockIamRole: getBedrockIamRoleAccess({
          sessionUser: ctx.session.user,
          owner: { type: "project", projectId },
          externalIdNonce: bedrockExternalIdNonce,
        }),
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
      const { projectId, bedrockExternalIdNonce, ...connectionInput } = input;
      await new LlmConnectionService().update({
        owner: {
          type: "project",
          projectId,
          organizationId: ctx.session.orgId,
        },
        input: connectionInput,
        actor: { session: ctx.session },
        bedrockIamRole: getBedrockIamRoleAccess({
          sessionUser: ctx.session.user,
          owner: { type: "project", projectId },
          externalIdNonce: bedrockExternalIdNonce,
        }),
      });
    }),

  bedrockIamRoleAuth: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "llmApiKeys:read",
      });
      return {
        crossAccountRoleArn: getBedrockCrossAccountRoleArn({
          sessionUser: ctx.session.user,
          owner: { type: "project", projectId: input.projectId },
        }),
      };
    }),

  bedrockExternalId: protectedProjectProcedureWithoutTracing
    .input(
      z.object({
        projectId: z.string(),
        nonce: z.uuid(),
        /** An edited connection keeps the external ID it was saved with. */
        connectionId: z.string().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "llmApiKeys:create",
      });
      return {
        externalId: await getBedrockExternalId({
          prisma: ctx.prisma,
          sessionUser: ctx.session.user,
          owner: { type: "project", projectId: input.projectId },
          nonce: input.nonce,
          connectionId: input.connectionId,
        }),
      };
    }),
});
