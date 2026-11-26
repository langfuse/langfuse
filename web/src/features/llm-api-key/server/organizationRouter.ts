import { z } from "zod";
import type { Session } from "next-auth";

import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  CreateOrganizationLlmApiKey,
  UpdateOrganizationLlmApiKey,
} from "@/src/features/llm-api-key/types";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
  protectedOrganizationProcedureWithoutTracing,
} from "@/src/server/api/trpc";

import {
  getBedrockCrossAccountRoleArn,
  getBedrockExternalId,
  getBedrockIamRoleAccess,
} from "./bedrockIamRoleAccess";
import { LlmConnectionService } from "./llmConnectionService";

const requireAccess = (params: {
  session: Session;
  orgId: string;
  scope: "organizationLlmApiKeys:read" | "organizationLlmApiKeys:CUD";
}) =>
  throwIfNoOrganizationAccess({
    session: params.session,
    organizationId: params.orgId,
    scope: params.scope,
  });

export const organizationLlmApiKeyRouter = createTRPCRouter({
  all: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        includeDecisionModels: z.boolean().optional().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      requireAccess({
        session: ctx.session,
        orgId: input.orgId,
        scope: "organizationLlmApiKeys:read",
      });

      return new LlmConnectionService().list({
        owner: {
          type: "organization",
          organizationId: input.orgId,
        },
        includeDecisionModels: input.includeDecisionModels,
      });
    }),

  create: protectedOrganizationProcedureWithoutTracing
    .input(CreateOrganizationLlmApiKey)
    .mutation(async ({ input, ctx }) => {
      requireAccess({
        session: ctx.session,
        orgId: input.orgId,
        scope: "organizationLlmApiKeys:CUD",
      });
      const { orgId, bedrockExternalIdNonce, ...connectionInput } = input;
      return new LlmConnectionService().create({
        owner: { type: "organization", organizationId: orgId },
        input: connectionInput,
        actor: { session: ctx.session },
        bedrockIamRole: getBedrockIamRoleAccess({
          sessionUser: ctx.session.user,
          owner: { type: "organization", organizationId: orgId },
          externalIdNonce: bedrockExternalIdNonce,
        }),
      });
    }),

  update: protectedOrganizationProcedureWithoutTracing
    .input(UpdateOrganizationLlmApiKey)
    .mutation(async ({ input, ctx }) => {
      requireAccess({
        session: ctx.session,
        orgId: input.orgId,
        scope: "organizationLlmApiKeys:CUD",
      });
      const { orgId, bedrockExternalIdNonce, ...connectionInput } = input;
      return new LlmConnectionService().update({
        owner: { type: "organization", organizationId: orgId },
        input: connectionInput,
        actor: { session: ctx.session },
        bedrockIamRole: getBedrockIamRoleAccess({
          sessionUser: ctx.session.user,
          owner: { type: "organization", organizationId: orgId },
          externalIdNonce: bedrockExternalIdNonce,
        }),
      });
    }),

  delete: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string(), id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      requireAccess({
        session: ctx.session,
        orgId: input.orgId,
        scope: "organizationLlmApiKeys:CUD",
      });
      await new LlmConnectionService().delete({
        owner: {
          type: "organization",
          organizationId: input.orgId,
        },
        id: input.id,
        actor: { session: ctx.session },
      });
      return { success: true };
    }),

  test: protectedOrganizationProcedureWithoutTracing
    .input(CreateOrganizationLlmApiKey)
    .mutation(async ({ input, ctx }) => {
      requireAccess({
        session: ctx.session,
        orgId: input.orgId,
        scope: "organizationLlmApiKeys:CUD",
      });
      const { orgId, bedrockExternalIdNonce, ...connectionInput } = input;
      return new LlmConnectionService().test(connectionInput, {
        bedrockIamRole: getBedrockIamRoleAccess({
          sessionUser: ctx.session.user,
          owner: { type: "organization", organizationId: orgId },
          externalIdNonce: bedrockExternalIdNonce,
        }),
      });
    }),

  testUpdate: protectedOrganizationProcedureWithoutTracing
    .input(UpdateOrganizationLlmApiKey)
    .mutation(async ({ input, ctx }) => {
      requireAccess({
        session: ctx.session,
        orgId: input.orgId,
        scope: "organizationLlmApiKeys:CUD",
      });
      const { orgId, bedrockExternalIdNonce, ...connectionInput } = input;
      return new LlmConnectionService().testUpdate({
        owner: { type: "organization", organizationId: orgId },
        input: connectionInput,
        bedrockIamRole: getBedrockIamRoleAccess({
          sessionUser: ctx.session.user,
          owner: { type: "organization", organizationId: orgId },
          externalIdNonce: bedrockExternalIdNonce,
        }),
      });
    }),

  bedrockIamRoleAuth: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .query(({ input, ctx }) => {
      requireAccess({
        session: ctx.session,
        orgId: input.orgId,
        scope: "organizationLlmApiKeys:read",
      });
      return {
        crossAccountRoleArn: getBedrockCrossAccountRoleArn({
          sessionUser: ctx.session.user,
          owner: { type: "organization", organizationId: input.orgId },
        }),
      };
    }),

  bedrockExternalId: protectedOrganizationProcedureWithoutTracing
    .input(
      z.object({
        orgId: z.string(),
        nonce: z.uuid(),
        /** An edited connection keeps the external ID it was saved with. */
        connectionId: z.string().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      requireAccess({
        session: ctx.session,
        orgId: input.orgId,
        scope: "organizationLlmApiKeys:CUD",
      });
      return {
        externalId: await getBedrockExternalId({
          prisma: ctx.prisma,
          sessionUser: ctx.session.user,
          owner: { type: "organization", organizationId: input.orgId },
          nonce: input.nonce,
          connectionId: input.connectionId,
        }),
      };
    }),
});
