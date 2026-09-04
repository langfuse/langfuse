import { z } from "zod/v4";
import type { Session } from "next-auth";
import { StringNoHTMLNonEmpty } from "@langfuse/shared";

import { auditLog } from "@/src/features/audit-logs/server";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
  protectedOrganizationProcedureWithoutTracing,
} from "@/src/server/api/trpc";
import {
  GatewayConnectionStatus,
  GatewayInstrumentationMode,
  GatewayProvider,
} from "@langfuse/shared/src/db";
import { invalidateCachedOrgApiKeys, redis } from "@langfuse/shared/src/server";

import { GatewayApiKeyService } from "./gatewayApiKeyService";
import { GatewayProviderService } from "./gatewayProviderService";
import { GatewayService } from "./gatewayService";
import { GatewayMetadataSchema } from "./providerRegistry";

const organizationInput = z.object({ orgId: z.string() });
const paginatedOrganizationInput = organizationInput.extend({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

function requireGatewayAdmin(params: { session: Session; orgId: string }) {
  throwIfNoOrganizationAccess({
    session: params.session,
    organizationId: params.orgId,
    scope: "organization:update",
  });
}

export const llmGatewayRouter = createTRPCRouter({
  getConfig: protectedOrganizationProcedure
    .input(organizationInput)
    .query(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      return new GatewayService(ctx.prisma).getConfig(input.orgId);
    }),

  updateConfig: protectedOrganizationProcedure
    .input(
      organizationInput
        .extend({
          defaultIngestionProjectId: z.string().nullable(),
          createProjectName: StringNoHTMLNonEmpty.max(200).optional(),
          instrumentationMode: z.enum(GatewayInstrumentationMode),
        })
        .refine(
          (input) =>
            !(input.defaultIngestionProjectId && input.createProjectName),
          "Select an existing project or create a new one",
        ),
    )
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      const service = new GatewayService(ctx.prisma);
      const before = await service.getConfig(input.orgId);
      const result = await service.updateConfig({
        organizationId: input.orgId,
        defaultIngestionProjectId: input.defaultIngestionProjectId,
        ...(input.createProjectName
          ? { createProjectName: input.createProjectName }
          : {}),
        createdByUserId: ctx.session.user.id,
        instrumentationMode: input.instrumentationMode,
      });
      const after = result.config;
      await auditLog({
        session: ctx.session,
        resourceType: "gatewayConfig",
        resourceId: input.orgId,
        action: before ? "update" : "create",
        before,
        after,
      });
      if (result.project) {
        await auditLog({
          session: ctx.session,
          resourceType: "project",
          resourceId: result.project.id,
          action: "create",
          after: result.project,
        });
        await invalidateCachedOrgApiKeys(input.orgId);
      }
      return after;
    }),

  listConnections: protectedOrganizationProcedure
    .input(paginatedOrganizationInput)
    .query(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      return new GatewayProviderService(ctx.prisma).list({
        organizationId: input.orgId,
        cursor: input.cursor,
        limit: input.limit,
      });
    }),

  createConnection: protectedOrganizationProcedureWithoutTracing
    .input(
      organizationInput.extend({
        name: z.string().trim().min(1).max(200),
        provider: z.enum(GatewayProvider),
        credential: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      const connection = await new GatewayProviderService(ctx.prisma).create({
        organizationId: input.orgId,
        name: input.name,
        provider: input.provider,
        credential: input.credential,
        createdById: ctx.session.user.id,
      });
      await auditLog({
        session: ctx.session,
        resourceType: "gatewayAiConnection",
        resourceId: connection.id,
        action: "create",
        after: connection,
      });
      return connection;
    }),

  updateConnection: protectedOrganizationProcedureWithoutTracing
    .input(
      organizationInput.extend({
        id: z.string(),
        name: z.string().trim().min(1).max(200).optional(),
        credential: z.string().min(1).optional(),
        status: z
          .enum([
            GatewayConnectionStatus.ENABLED,
            GatewayConnectionStatus.DISABLED,
          ])
          .optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      const service = new GatewayProviderService(ctx.prisma);
      const before = (await service.listAll(input.orgId)).find(
        (connection) => connection.id === input.id,
      );
      const after = await service.update({
        organizationId: input.orgId,
        id: input.id,
        name: input.name,
        credential: input.credential,
        status: input.status,
      });
      await auditLog({
        session: ctx.session,
        resourceType: "gatewayAiConnection",
        resourceId: input.id,
        action: "update",
        before,
        after,
      });
      return after;
    }),

  deleteConnection: protectedOrganizationProcedure
    .input(organizationInput.extend({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      const deleted = await new GatewayProviderService(ctx.prisma).delete({
        organizationId: input.orgId,
        id: input.id,
      });
      await auditLog({
        session: ctx.session,
        resourceType: "gatewayAiConnection",
        resourceId: input.id,
        action: "delete",
        before: deleted,
      });
      return { success: true };
    }),

  reorderConnections: protectedOrganizationProcedure
    .input(
      organizationInput.extend({
        connectionIds: z.array(z.string()),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      const service = new GatewayProviderService(ctx.prisma);
      const before = await service.listAll(input.orgId);
      await service.reorder({
        organizationId: input.orgId,
        connectionIds: input.connectionIds,
      });
      const after = await service.listAll(input.orgId);
      await auditLog({
        session: ctx.session,
        resourceType: "gatewayAiConnection",
        resourceId: input.orgId,
        action: "reorder",
        before,
        after,
      });
      return after;
    }),

  refreshModels: protectedOrganizationProcedure
    .input(organizationInput)
    .query(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      return new GatewayProviderService(ctx.prisma).refreshAllModels(
        input.orgId,
      );
    }),

  retryConnection: protectedOrganizationProcedure
    .input(organizationInput.extend({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      const result = await new GatewayProviderService(ctx.prisma).refreshModels(
        {
          organizationId: input.orgId,
          connectionId: input.id,
          explicitRetry: true,
        },
      );
      await auditLog({
        session: ctx.session,
        resourceType: "gatewayAiConnection",
        resourceId: input.id,
        action: "retry",
      });
      return result;
    }),

  listApiKeys: protectedOrganizationProcedure
    .input(paginatedOrganizationInput)
    .query(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      return new GatewayApiKeyService(ctx.prisma, redis).list({
        organizationId: input.orgId,
        cursor: input.cursor,
        limit: input.limit,
      });
    }),

  createApiKey: protectedOrganizationProcedure
    .input(
      organizationInput.extend({
        note: z.string().max(500).optional(),
        metadata: GatewayMetadataSchema.default({}),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      const key = await new GatewayApiKeyService(ctx.prisma, redis).create({
        organizationId: input.orgId,
        note: input.note,
        metadata: input.metadata,
        createdByUserId: ctx.session.user.id,
      });
      await auditLog({
        session: ctx.session,
        resourceType: "gatewayApiKey",
        resourceId: key.id,
        action: "create",
        after: {
          id: key.id,
          publicKey: key.publicKey,
          displaySecretKey: key.displaySecretKey,
          note: key.note,
        },
      });
      return key;
    }),

  revokeApiKey: protectedOrganizationProcedure
    .input(organizationInput.extend({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      const success = await new GatewayApiKeyService(ctx.prisma, redis).revoke({
        organizationId: input.orgId,
        apiKeyId: input.id,
      });
      await auditLog({
        session: ctx.session,
        resourceType: "gatewayApiKey",
        resourceId: input.id,
        action: "delete",
      });
      return { success };
    }),
});
