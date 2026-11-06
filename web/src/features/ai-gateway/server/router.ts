import { z } from "zod/v4";
// The shared query schema is zod v3, which a zod v4 object cannot nest.
import { z as zodV3 } from "zod";
import type { Session } from "next-auth";

import {
  hasOrganizationAccess,
  throwIfNoOrganizationAccess,
} from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
  protectedOrganizationProcedureWithoutTracing,
  type AuthedSession,
} from "@/src/server/api/trpc";
import { env } from "@/src/env.mjs";
import { canReadGatewayModels } from "@/src/features/ai-gateway/fns/canReadGatewayModels";
import { getAvailableGatewayProviders } from "@/src/features/ai-gateway/fns/getAvailableGatewayProviders";
import { isGatewayPreReleaseEnvironment } from "@/src/features/ai-gateway/fns/isGatewayPreReleaseEnvironment";
import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";
import { getProductBaseUrl } from "@/src/utils/base-url";
import {
  GatewayConnectionStatus,
  GatewayIngestionMode,
  GatewayProvider,
} from "@langfuse/shared/src/db";
import { redis } from "@langfuse/shared/src/server";
import { ForbiddenError, orderBy } from "@langfuse/shared";
import { query as analyticsQuery } from "@langfuse/shared/query";

import {
  GatewayApiKeyService,
  gatewayApiKeyCreatorScopes,
} from "./apiKey/gatewayApiKeyService";
import { requireGatewayEnabledForOrganization } from "./availability";
import { getGatewayBaseUrl } from "@/src/features/ai-gateway/fns/gatewayUrls/getGatewayBaseUrl";
import {
  MAX_MEMBER_SEARCH_LENGTH,
  MAX_TEAM_INVITES,
} from "@/src/features/ai-gateway/constants/gatewayTeamInvites";
import { GatewayAnalyticsLabelsRepository } from "./analytics/gatewayAnalyticsLabelsRepository";
import { GatewayAnalyticsService } from "./analytics/gatewayAnalyticsService";
import { GatewayConfigService } from "./config/gatewayConfigService";
import { getKeyOwnerFilter, type GatewayUsageScope } from "./gatewayUsageScope";
import { GatewayTeamService } from "./team/gatewayTeamService";
import { GatewayMetadataSchema } from "@/src/features/ai-gateway/server/provider/registry";
import { GatewayBedrockConfigSchema } from "@/src/features/ai-gateway/server/provider/bedrock";
import type { GatewayApiFamily } from "@/src/features/ai-gateway/types/gatewayProvider";
import { GatewayModelCatalogService } from "@/src/features/ai-gateway/server/provider/models/gatewayModelCatalogService";
import { GatewayProviderService } from "@/src/features/ai-gateway/server/provider/connection/gatewayProviderService";

const organizationInput = z.object({ orgId: z.string() });
/** Naming rules live in `parseGatewayConnectionName` so the dialog can show them on the field. */
const connectionNameSchema = z.string().max(1_000);
// Same shape as LLM connections: a blank header value keeps the stored one.
const connectionEndpointInput = {
  baseURL: z.url().nullish(),
  extraHeaders: z.record(z.string(), z.string()).optional(),
};
const pageLimitSchema = z.number().int().min(1).max(100).default(50);
const paginatedOrganizationInput = organizationInput.extend({
  cursor: z.string().optional(),
  limit: pageLimitSchema,
});
const offsetPaginatedOrganizationInput = organizationInput.extend({
  page: z.number().int().min(0).default(0),
  limit: pageLimitSchema,
});
const connectionInput = organizationInput.extend({ id: z.string() });
const allowedModelsSchema = z
  .array(z.string().trim().min(1).max(500))
  .max(10_000)
  .nullable();
const customModelSchema = z.string().trim().min(1).max(500);

function requireGatewayAdmin(params: { session: Session; orgId: string }) {
  requireGatewayEnabledForOrganization(params.orgId);
  throwIfNoOrganizationAccess({
    session: params.session,
    organizationId: params.orgId,
    scope: "gateway:manage",
  });
}

function requireProviderAvailable(provider: GatewayProvider) {
  if (!getAvailableGatewayProviders().includes(provider)) {
    throw new ForbiddenError("This provider is not available yet.");
  }
}

function requirePreReleaseEnvironment() {
  if (!isGatewayPreReleaseEnvironment()) {
    throw new ForbiddenError("Custom models are not available yet.");
  }
}

function requireCustomEndpointAvailable(endpoint: {
  baseURL?: string | null;
  extraHeaders?: Record<string, string>;
}) {
  const hasCustomEndpoint =
    Boolean(endpoint.baseURL) ||
    Object.keys(endpoint.extraHeaders ?? {}).length > 0;
  if (hasCustomEndpoint && !isGatewayPreReleaseEnvironment()) {
    throw new ForbiddenError(
      "Custom base URLs and extra headers are not available yet.",
    );
  }
}

/** Admits gateway key owners. */
function requireGatewayInvoke(params: { session: Session; orgId: string }) {
  requireGatewayEnabledForOrganization(params.orgId);
  throwIfNoOrganizationAccess({
    session: params.session,
    organizationId: params.orgId,
    scope: "gateway:invoke",
  });
}

/** Gateway managers see the whole organization; every other key owner only their own keys and usage. */
function getGatewayUsageScope(params: {
  session: AuthedSession;
  orgId: string;
}): GatewayUsageScope {
  const canManageGateway = hasOrganizationAccess({
    session: params.session,
    organizationId: params.orgId,
    scope: "gateway:manage",
  });
  return canManageGateway
    ? { scope: "organization" }
    : { scope: "ownUsage", userId: params.session.user.id };
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
      };
    }),

  /** Readable by every gateway reader and key owner; exposes only whether setup is done, not the config itself. */
  getSetupStatus: protectedOrganizationProcedure
    .input(organizationInput)
    .query(async ({ input, ctx }) => {
      const canInvokeGateway = hasOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "gateway:invoke",
      });
      if (canInvokeGateway)
        requireGatewayInvoke({ session: ctx.session, orgId: input.orgId });
      else requireGatewayRead({ session: ctx.session, orgId: input.orgId });
      return new GatewayConfigService(ctx.prisma).getSetupStatus(input.orgId);
    }),

  /** Names for the API key and user IDs that gateway analytics break down by. */
  getAnalyticsLabels: protectedOrganizationProcedure
    .input(organizationInput)
    .query(async ({ input, ctx }) => {
      requireGatewayInvoke({ session: ctx.session, orgId: input.orgId });
      const usageScope = getGatewayUsageScope({
        session: ctx.session,
        orgId: input.orgId,
      });
      return new GatewayAnalyticsLabelsRepository(ctx.prisma).getLabels({
        organizationId: input.orgId,
        usageScope,
      });
    }),

  /** Gateway managers see all gateway usage; everyone else only their own. */
  executeAnalyticsQuery: protectedOrganizationProcedure
    .input(zodV3.object({ orgId: zodV3.string(), query: analyticsQuery }))
    .query(async ({ input, ctx }) => {
      requireGatewayInvoke({ session: ctx.session, orgId: input.orgId });
      const usageScope = getGatewayUsageScope({
        session: ctx.session,
        orgId: input.orgId,
      });
      return new GatewayAnalyticsService(
        new GatewayConfigService(ctx.prisma),
      ).executeQuery({
        organizationId: input.orgId,
        query: input.query,
        usageScope,
      });
    }),

  /** What a key owner needs to point a client at the gateway; no connection details. */
  getClientSetup: protectedOrganizationProcedure
    .input(organizationInput)
    .query(async ({ input, ctx }) => {
      requireGatewayInvoke({ session: ctx.session, orgId: input.orgId });
      const connections = await new GatewayProviderService(ctx.prisma).listAll(
        input.orgId,
        GatewayConnectionStatus.ENABLED,
      );
      return {
        gatewayBaseUrl: getGatewayBaseUrl(
          getProductBaseUrl(),
          env.LANGFUSE_AI_GATEWAY_PUBLIC_URL,
        ),
        // Client setups rely on implicit `claude-*`/`gpt-*` routing, which never
        // picks Bedrock; Bedrock models need an explicit `<connection>:<model>` slug.
        providers: [
          ...new Set(
            connections.flatMap((connection): GatewayApiFamily[] =>
              connection.provider === "BEDROCK" ? [] : [connection.provider],
            ),
          ),
        ],
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

  getNotifiableMembers: protectedOrganizationProcedure
    .input(organizationInput)
    .query(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      return new GatewayTeamService(ctx.prisma).getNotifiableMembers({
        organizationId: input.orgId,
        currentUserId: ctx.session.user.id,
      });
    }),

  getMemberSuggestions: protectedOrganizationProcedure
    .input(
      organizationInput.extend({
        search: z.string().max(MAX_MEMBER_SEARCH_LENGTH),
        excludeEmails: z.array(z.string()).max(MAX_TEAM_INVITES),
      }),
    )
    .query(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      return new GatewayTeamService(ctx.prisma).getMemberSuggestions({
        organizationId: input.orgId,
        currentUserId: ctx.session.user.id,
        search: input.search,
        excludeEmails: input.excludeEmails,
      });
    }),

  getInviteeMembers: protectedOrganizationProcedure
    .input(
      organizationInput.extend({
        emails: z.array(z.email()).max(MAX_TEAM_INVITES),
      }),
    )
    .query(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      return new GatewayTeamService(ctx.prisma).getInviteeMembers({
        organizationId: input.orgId,
        currentUserId: ctx.session.user.id,
        emails: input.emails,
      });
    }),

  /** Invites new people with the AI Gateway role and optionally tells existing members. */
  inviteTeam: protectedOrganizationProcedure
    .input(
      organizationInput.extend({
        emails: z.array(z.email()).max(MAX_TEAM_INVITES),
        notifyMembers: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      return new GatewayTeamService(ctx.prisma).inviteTeam({
        ctx,
        organizationId: input.orgId,
        emails: input.emails,
        notifyMembers: input.notifyMembers,
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
        /** The connection being edited, whose stored header values the test reuses. */
        id: z.string().optional(),
        provider: z.enum(GatewayProvider),
        credential: z.string().min(1),
        config: GatewayBedrockConfigSchema.optional(),
        ...connectionEndpointInput,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      requireProviderAvailable(input.provider);
      requireCustomEndpointAvailable(input);
      const { modelListingDenied } = await new GatewayProviderService(
        ctx.prisma,
      ).testCredential({
        organizationId: input.orgId,
        connectionId: input.id,
        provider: input.provider,
        credential: input.credential,
        config: input.config,
        baseURL: input.baseURL,
        extraHeaders: input.extraHeaders,
      });
      return { success: true, modelListingDenied };
    }),

  createConnection: protectedOrganizationProcedureWithoutTracing
    .input(
      organizationInput.extend({
        name: connectionNameSchema,
        provider: z.enum(GatewayProvider),
        credential: z.string().min(1),
        config: GatewayBedrockConfigSchema.optional(),
        ...connectionEndpointInput,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      requireProviderAvailable(input.provider);
      requireCustomEndpointAvailable(input);
      const connection = await new GatewayProviderService(ctx.prisma).create({
        organizationId: input.orgId,
        name: input.name,
        provider: input.provider,
        credential: input.credential,
        config: input.config,
        baseURL: input.baseURL,
        extraHeaders: input.extraHeaders,
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
        ...connectionEndpointInput,
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
      requireCustomEndpointAvailable(input);
      return new GatewayProviderService(ctx.prisma).update({
        organizationId: input.orgId,
        id: input.id,
        name: input.name,
        credential: input.credential,
        baseURL: input.baseURL,
        extraHeaders: input.extraHeaders,
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

  addConnectionCustomModel: protectedOrganizationProcedure
    .input(
      connectionInput.extend({
        model: customModelSchema,
        expectedUpdatedAt: z.date(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      requirePreReleaseEnvironment();
      return new GatewayProviderService(ctx.prisma).addCustomModel({
        organizationId: input.orgId,
        id: input.id,
        model: input.model,
        expectedUpdatedAt: input.expectedUpdatedAt,
        session: ctx.session,
      });
    }),

  removeConnectionCustomModel: protectedOrganizationProcedure
    .input(
      connectionInput.extend({
        model: customModelSchema,
        expectedUpdatedAt: z.date(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      return new GatewayProviderService(ctx.prisma).removeCustomModel({
        organizationId: input.orgId,
        id: input.id,
        model: input.model,
        expectedUpdatedAt: input.expectedUpdatedAt,
        session: ctx.session,
      });
    }),

  testConnectionModel: protectedOrganizationProcedureWithoutTracing
    .input(connectionInput.extend({ model: customModelSchema }))
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      requirePreReleaseEnvironment();
      return new GatewayProviderService(ctx.prisma).testModel({
        organizationId: input.orgId,
        id: input.id,
        model: input.model,
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
        : await catalogService.listAllModels(input.orgId);
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
    .input(
      offsetPaginatedOrganizationInput.extend({
        searchQuery: z.string().trim().optional(),
        orderBy: orderBy.optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      requireGatewayInvoke({ session: ctx.session, orgId: input.orgId });
      const usageScope = getGatewayUsageScope({
        session: ctx.session,
        orgId: input.orgId,
      });
      return new GatewayApiKeyService(ctx.prisma, redis).list({
        organizationId: input.orgId,
        ownerUserId: getKeyOwnerFilter(usageScope),
        searchQuery: input.searchQuery,
        orderBy: input.orderBy,
        page: input.page,
        limit: input.limit,
      });
    }),

  /** Loaded after listApiKeys for the visible page, so ClickHouse never delays the key list. */
  getApiKeysLastUsed: protectedOrganizationProcedure
    .input(
      organizationInput.extend({
        apiKeyIds: z.array(z.string()).max(100),
      }),
    )
    .query(async ({ input, ctx }) => {
      requireGatewayInvoke({ session: ctx.session, orgId: input.orgId });
      const usageScope = getGatewayUsageScope({
        session: ctx.session,
        orgId: input.orgId,
      });
      return new GatewayApiKeyService(ctx.prisma, redis).getLastUsed({
        organizationId: input.orgId,
        ownerUserId: getKeyOwnerFilter(usageScope),
        apiKeyIds: input.apiKeyIds,
      });
    }),

  // Returns the plaintext secret key once, so the procedure must not be traced.
  createApiKey: protectedOrganizationProcedureWithoutTracing
    .input(
      organizationInput.extend({
        name: z.string().trim().min(1, "Gateway keys need a name").max(500),
        metadata: GatewayMetadataSchema.default({}),
        expiresAt: z
          .date()
          .nullish()
          .refine((date) => date == null || date.getTime() > Date.now(), {
            message: "Expiration date must be in the future",
          }),
        issuedAs: z.enum(["user", "serviceAccount"]).default("user"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // Legacy public API auth ignores key roles, so a gateway key passes as an
      // organization admin key there; only managers may mint one outside enforce.
      if (env.API_AUTH_MIGRATION === "enforce" && input.issuedAs === "user") {
        requireGatewayInvoke({ session: ctx.session, orgId: input.orgId });
      } else {
        requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      }
      for (const scope of gatewayApiKeyCreatorScopes(input.issuedAs)) {
        throwIfNoOrganizationAccess({
          session: ctx.session,
          organizationId: input.orgId,
          scope,
        });
      }
      const key = await new GatewayApiKeyService(ctx.prisma, redis).create({
        organizationId: input.orgId,
        name: input.name,
        metadata: input.metadata,
        expiresAt: input.expiresAt,
        issuedAs: input.issuedAs,
        session: ctx.session,
      });
      return key;
    }),

  revokeApiKey: protectedOrganizationProcedure
    .input(connectionInput)
    .mutation(async ({ input, ctx }) => {
      requireGatewayInvoke({ session: ctx.session, orgId: input.orgId });
      const usageScope = getGatewayUsageScope({
        session: ctx.session,
        orgId: input.orgId,
      });
      await new GatewayApiKeyService(ctx.prisma, redis).revoke({
        organizationId: input.orgId,
        ownerUserId: getKeyOwnerFilter(usageScope),
        apiKeyId: input.id,
        session: ctx.session,
      });
      return { success: true };
    }),
});
