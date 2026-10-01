import { z } from "zod/v4";
import type { Session } from "next-auth";

import { throwIfNoOrganizationAccess } from "@/src/features/rbac";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
  protectedOrganizationProcedureWithoutTracing,
} from "@/src/server/api/trpc";
import { getProductBaseUrl } from "@/src/utils/base-url";
import {
  GatewayConnectionStatus,
  GatewayIngestionMode,
  GatewayProvider,
} from "@langfuse/shared/src/db";
import { redis } from "@langfuse/shared/src/server";

import { GatewayApiKeyService } from "./apiKey/gatewayApiKeyService";
import { requireGatewayEnabledForOrganization } from "./availability";
import { getGatewayBaseUrl } from "@/src/features/ai-gateway/fns/gatewayUrls/getGatewayBaseUrl";
import { GatewayConfigService } from "./config/gatewayConfigService";
import {
  GatewayMetadataSchema,
  GatewayModelCatalogService,
  GatewayProviderService,
} from "./provider";

const organizationInput = z.object({ orgId: z.string() });
const paginatedOrganizationInput = organizationInput.extend({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

function requireGatewayAdmin(params: { session: Session; orgId: string }) {
  requireGatewayEnabledForOrganization(params.orgId);
  throwIfNoOrganizationAccess({
    session: params.session,
    organizationId: params.orgId,
    scope: "gateway:manage",
  });
}

export const aiGatewayRouter = createTRPCRouter({
  getConfig: protectedOrganizationProcedure
    .input(organizationInput)
    .query(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      return {
        config: await new GatewayConfigService(ctx.prisma).getConfig(
          input.orgId,
        ),
        gatewayBaseUrl: getGatewayBaseUrl(getProductBaseUrl()),
      };
    }),

  updateConfig: protectedOrganizationProcedure
    .input(
      organizationInput.extend({
        defaultIngestionProjectId: z.string().nullable(),
        ingestionMode: z.enum(GatewayIngestionMode),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      return new GatewayConfigService(ctx.prisma).updateConfig({
        organizationId: input.orgId,
        defaultIngestionProjectId: input.defaultIngestionProjectId,
        ingestionMode: input.ingestionMode,
        session: ctx.session,
      });
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

  testConnection: protectedOrganizationProcedureWithoutTracing
    .input(
      organizationInput.extend({
        provider: z.enum(GatewayProvider),
        credential: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      await new GatewayProviderService(ctx.prisma).testCredential({
        provider: input.provider,
        credential: input.credential,
      });
      return { success: true };
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
        session: ctx.session,
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
      return new GatewayProviderService(ctx.prisma).update({
        organizationId: input.orgId,
        id: input.id,
        name: input.name,
        credential: input.credential,
        status: input.status,
        session: ctx.session,
      });
    }),

  deleteConnection: protectedOrganizationProcedure
    .input(organizationInput.extend({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      await new GatewayProviderService(ctx.prisma).delete({
        organizationId: input.orgId,
        id: input.id,
        session: ctx.session,
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
      return new GatewayProviderService(ctx.prisma).reorder({
        organizationId: input.orgId,
        connectionIds: input.connectionIds,
        session: ctx.session,
      });
    }),

  refreshModels: protectedOrganizationProcedure
    .input(organizationInput)
    .query(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      return new GatewayModelCatalogService(ctx.prisma).refreshAllModels(
        input.orgId,
      );
    }),

  syncModels: protectedOrganizationProcedure
    .input(organizationInput)
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      return new GatewayModelCatalogService(ctx.prisma).refreshAllModels(
        input.orgId,
        true,
      );
    }),

  retryConnection: protectedOrganizationProcedure
    .input(organizationInput.extend({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      return new GatewayModelCatalogService(ctx.prisma).retryConnection({
        organizationId: input.orgId,
        connectionId: input.id,
        session: ctx.session,
      });
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

  // Returns the plaintext secret key once, so the procedure must not be traced.
  createApiKey: protectedOrganizationProcedureWithoutTracing
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
        session: ctx.session,
      });
      return key;
    }),

  revokeApiKey: protectedOrganizationProcedure
    .input(organizationInput.extend({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      await new GatewayApiKeyService(ctx.prisma, redis).revoke({
        organizationId: input.orgId,
        apiKeyId: input.id,
        session: ctx.session,
      });
      return { success: true };
    }),
});
