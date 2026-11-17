import { z } from "zod";
import { type Session } from "next-auth";
import { getOrCreateBedrockRoleExternalId } from "@langfuse/shared/src/server/ee/bedrockRoleAuth/bedrockRoleCredentials";
import { getCrossAccountRoleArn } from "@langfuse/shared/src/server/ee/storageRoleAuth/storageRoleCredentials";
import { hasEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import {
  CreateLlmApiKey,
  UpdateLlmApiKey,
} from "@/src/features/llm-api-key/types";
import { TRPCError } from "@trpc/server";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
  protectedProjectProcedureWithoutTracing,
} from "@/src/server/api/trpc";
import {
  type BedrockIamRoleAccess,
  LlmConnectionService,
} from "./llmConnectionService";

// Only the organization's plan grants IAM role auth; Langfuse admins get no bypass.
function canUseBedrockIamRole(params: {
  sessionUser: NonNullable<Session["user"]>;
  projectId: string;
}) {
  return Boolean(
    hasEntitlement({ ...params, entitlement: "bedrock-iam-role-auth" }),
  );
}

function getBedrockIamRoleAccess(params: {
  sessionUser: NonNullable<Session["user"]>;
  projectId: string;
}): BedrockIamRoleAccess | undefined {
  return canUseBedrockIamRole(params)
    ? { projectId: params.projectId }
    : undefined;
}

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
          projectId,
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
      const { projectId, ...connectionInput } = input;
      return new LlmConnectionService().test(connectionInput, {
        bedrockIamRole: getBedrockIamRoleAccess({
          sessionUser: ctx.session.user,
          projectId,
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
      const { projectId, ...connectionInput } = input;
      return new LlmConnectionService().testUpdate({
        owner: {
          type: "project",
          projectId,
          organizationId: ctx.session.orgId,
        },
        input: connectionInput,
        bedrockIamRole: getBedrockIamRoleAccess({
          sessionUser: ctx.session.user,
          projectId,
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
      const { projectId, ...connectionInput } = input;
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
          projectId,
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
      const deploymentRoleArn = getCrossAccountRoleArn();
      const planIncludesRoleAuth = canUseBedrockIamRole({
        sessionUser: ctx.session.user,
        projectId: input.projectId,
      });
      return {
        /** Null when this deployment or the organization does not offer IAM role auth. */
        crossAccountRoleArn: planIncludesRoleAuth ? deploymentRoleArn : null,
        requiresUpgrade: deploymentRoleArn !== null && !planIncludesRoleAuth,
      };
    }),

  bedrockExternalId: protectedProjectProcedureWithoutTracing
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "llmApiKeys:create",
      });
      if (
        !getCrossAccountRoleArn() ||
        !canUseBedrockIamRole({
          sessionUser: ctx.session.user,
          projectId: input.projectId,
        })
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "IAM role auth for Bedrock is not available for this project.",
        });
      }
      return {
        externalId: await getOrCreateBedrockRoleExternalId(input.projectId),
      };
    }),
});
