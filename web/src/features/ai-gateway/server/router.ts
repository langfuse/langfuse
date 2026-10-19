import { z } from "zod/v4";
import type { Session } from "next-auth";

import {
  hasOrganizationAccess,
  throwIfNoOrganizationAccess,
} from "@/src/features/rbac";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
  protectedOrganizationProcedureWithoutTracing,
} from "@/src/server/api/trpc";
import { env } from "@/src/env.mjs";
import { canReadGatewayModels } from "@/src/features/ai-gateway/fns/canReadGatewayModels";
import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";
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
/** Naming rules live in `parseGatewayConnectionName` so the dialog can show them on the field. */
const connectionNameSchema = z.string().max(1_000);
const paginatedOrganizationInput = organizationInput.extend({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
const connectionInput = organizationInput.extend({ id: z.string() });
const allowedModelsSchema = z
  .array(z.string().trim().min(1).max(500))
  .max(10_000)
  .nullable();

function requireGatewayAdmin(params: { session: Session; orgId: string }) {
  requireGatewayEnabledForOrganization(params.orgId);
  throwIfNoOrganizationAccess({
    session: params.session,
    organizationId: params.orgId,
    scope: "gateway:manage",
  });
}

function requireGatewayRead(params: { session: Session; orgId: string }) {
  requireGatewayEnabledForOrganization(params.orgId);
  const canManageGateway = hasOrganizationAccess({
    session: params.session,
    organizationId: params.orgId,
    scope: "gateway:manage",
  });
  const canReadGateway = hasOrganizationAccess({
    session: params.session,
    organizationId: params.orgId,
    scope: "gateway:read",
  });
  if (
    !canReadGatewayModels({
      organizationId: params.orgId,
      demoOrganizationId: env.NEXT_PUBLIC_DEMO_ORG_ID,
      canReadGateway,
      canManageGateway,
    })
  ) {
    throwIfNoOrganizationAccess({
      session: params.session,
      organizationId: params.orgId,
      scope: "gateway:manage",
    });
  }
  throwIfNoOrganizationAccess({
    session: params.session,
    organizationId: params.orgId,
    scope: "gateway:read",
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

  getConnection: protectedOrganizationProcedure
    .input(connectionInput)
    .query(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      return new GatewayProviderService(ctx.prisma).get({
        organizationId: input.orgId,
        id: input.id,
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
        name: connectionNameSchema,
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
        name: connectionNameSchema.optional(),
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
    .input(connectionInput)
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      await new GatewayProviderService(ctx.prisma).delete({
        organizationId: input.orgId,
        id: input.id,
        session: ctx.session,
      });
      return { success: true };
    }),

  updateConnectionModels: protectedOrganizationProcedure
    .input(
      connectionInput.extend({
        allowedModels: allowedModelsSchema,
        expectedUpdatedAt: z.date(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      return new GatewayProviderService(ctx.prisma).updateAllowedModels({
        organizationId: input.orgId,
        id: input.id,
        allowedModels: input.allowedModels,
        expectedUpdatedAt: input.expectedUpdatedAt,
        session: ctx.session,
      });
    }),

  listModelConnections: protectedOrganizationProcedure
    .input(organizationInput)
    .query(async ({ input, ctx }) => {
      requireGatewayRead({ session: ctx.session, orgId: input.orgId });
      return new GatewayModelCatalogService(ctx.prisma).listModelConnections(
        input.orgId,
      );
    }),

  refreshModels: protectedOrganizationProcedure
    .input(organizationInput)
    .query(async ({ input, ctx }) => {
      requireGatewayRead({
        session: ctx.session,
        orgId: input.orgId,
      });
      const canManageGateway = hasOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "gateway:manage",
      });
      const catalogService = new GatewayModelCatalogService(ctx.prisma);
      const results = canManageGateway
        ? await catalogService.refreshAllModels(input.orgId)
        : await catalogService.listCachedModels(input.orgId);
      if (canManageGateway) return results;

      const readableConnections = await catalogService.listModelConnections(
        input.orgId,
      );
      const allowedModelsByConnectionId = new Map(
        readableConnections.map((connection) => [
          connection.id,
          connection.allowedModels,
        ]),
      );
      return results.map((result) =>
        result.success
          ? {
              ...result,
              models: result.models.filter((model) => {
                const allowedModels = allowedModelsByConnectionId.get(
                  result.connectionId,
                );
                return isGatewayModelAllowed(
                  allowedModels === undefined ? [] : allowedModels,
                  model,
                );
              }),
            }
          : result,
      );
    }),

  getConnectionModels: protectedOrganizationProcedure
    .input(connectionInput)
    .query(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      return new GatewayModelCatalogService(ctx.prisma).refreshModels({
        organizationId: input.orgId,
        connectionId: input.id,
      });
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
    .input(connectionInput)
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
        name: z.string().max(500).optional(),
        metadata: GatewayMetadataSchema.default({}),
        expiresAt: z
          .date()
          .nullish()
          .refine((date) => date == null || date.getTime() > Date.now(), {
            message: "Expiration date must be in the future",
          }),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      const key = await new GatewayApiKeyService(ctx.prisma, redis).create({
        organizationId: input.orgId,
        name: input.name,
        metadata: input.metadata,
        expiresAt: input.expiresAt,
        session: ctx.session,
      });
      return key;
    }),

  revokeApiKey: protectedOrganizationProcedure
    .input(connectionInput)
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
