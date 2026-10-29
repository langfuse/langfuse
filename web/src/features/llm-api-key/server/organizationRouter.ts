import { z } from "zod";
import type { Session } from "next-auth";

import { throwIfNoOrganizationAccess } from "@/src/features/rbac";
import {
  CreateOrganizationLlmApiKey,
  UpdateOrganizationLlmApiKey,
} from "@/src/features/llm-api-key/types";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
  protectedOrganizationProcedureWithoutTracing,
} from "@/src/server/api/trpc";

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
      const { orgId, ...connectionInput } = input;
      return new LlmConnectionService().create({
        owner: { type: "organization", organizationId: orgId },
        input: connectionInput,
        actor: { session: ctx.session },
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
      const { orgId, ...connectionInput } = input;
      return new LlmConnectionService().update({
        owner: { type: "organization", organizationId: orgId },
        input: connectionInput,
        actor: { session: ctx.session },
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
      const { orgId: _orgId, ...connectionInput } = input;
      return new LlmConnectionService().test(connectionInput);
    }),

  testUpdate: protectedOrganizationProcedureWithoutTracing
    .input(UpdateOrganizationLlmApiKey)
    .mutation(async ({ input, ctx }) => {
      requireAccess({
        session: ctx.session,
        orgId: input.orgId,
        scope: "organizationLlmApiKeys:CUD",
      });
      const { orgId, ...connectionInput } = input;
      return new LlmConnectionService().testUpdate({
        owner: { type: "organization", organizationId: orgId },
        input: connectionInput,
      });
    }),
});
