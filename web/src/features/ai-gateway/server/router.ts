import { z } from "zod/v4";
// The shared query schema is zod v3, which a zod v4 object cannot nest.
import { z as zodV3 } from "zod";
import type { Session } from "next-auth";

import { GATEWAY_BUDGET_STATUSES } from "@/src/features/ai-gateway/constants/gatewayBudgetStatuses";
import {
  hasOrganizationAccess,
  throwIfNoOrganizationAccess,
} from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
  protectedOrganizationProcedureWithoutTracing,
} from "@/src/server/api/trpc";
import { env } from "@/src/env.mjs";
import { canReadGatewayModels } from "@/src/features/ai-gateway/fns/canReadGatewayModels";
import { getProductBaseUrl } from "@/src/utils/base-url";
import {
  GatewayConnectionStatus,
  GatewayIngestionMode,
  GatewayProvider,
  GatewaySpendLimitInterval,
} from "@langfuse/shared/src/db";
import { redis } from "@langfuse/shared/src/server";
import { InvalidRequestError, orderBy } from "@langfuse/shared";
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
import { getKeyOwnerFilter } from "./gatewayUsageScope";
import {
  getGatewayUsageScope,
  requireGatewayAdmin,
  requireGatewayInvoke,
} from "./gatewayAccess";
import {
  GATEWAY_SPEND_BUDGET_ALERT_THRESHOLDS,
  type GatewaySpendBudgetAlertThreshold,
} from "@/src/features/ai-gateway/constants/gatewaySpendBudgetAlertThresholds";
import {
  GATEWAY_SPEND_BUDGET_MAX_MATCHING_SUBJECTS,
  GATEWAY_SPEND_BUDGET_MAX_SUBJECTS,
  GATEWAY_SPEND_BUDGET_MAX_USD,
} from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";
import { normalizeGatewaySpendBudgetAlertThresholds } from "@/src/features/ai-gateway/fns/spendLimits/normalizeGatewaySpendBudgetAlertThresholds";
import { GatewaySpendLimitService } from "./spendLimits/gatewaySpendLimitService";
import { GatewaySpendLimitRepository } from "./spendLimits/gatewaySpendLimitRepository";
import { GatewayTeamService } from "./team/gatewayTeamService";
import {
  GatewayMetadataSchema,
  GatewayProviderConfigSchema,
} from "@/src/features/ai-gateway/server/provider/registry";
import type { GatewayApiFamily } from "@/src/features/ai-gateway/types/gatewayProvider";
import { GatewayModelCatalogService } from "@/src/features/ai-gateway/server/provider/models/gatewayModelCatalogService";
import { GatewayProviderService } from "@/src/features/ai-gateway/server/provider/connection/gatewayProviderService";
import { ProviderCredentialRejectedError } from "@/src/features/ai-gateway/server/provider/connection/ProviderCredentialRejectedError";

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

const gatewaySpendLimitAlertThresholdInput = z
  .number()
  .int()
  .refine(
    (value): value is GatewaySpendBudgetAlertThreshold =>
      (GATEWAY_SPEND_BUDGET_ALERT_THRESHOLDS as readonly number[]).includes(
        value,
      ),
    "Unsupported alert threshold",
  );

/** A key's or user's single spend limit. */
const gatewaySpendLimitInput = z.object({
  interval: z.enum(GatewaySpendLimitInterval),
  limitUsd: z.number().positive().max(GATEWAY_SPEND_BUDGET_MAX_USD),
  // Omitted by older clients: updates preserve stored thresholds, creates default to [100].
  alertThresholds: z
    .array(gatewaySpendLimitAlertThresholdInput)
    .transform(normalizeGatewaySpendBudgetAlertThresholds)
    .optional(),
});
const gatewaySpendLimitScopeInput = z.enum(["API_KEY", "USER"]);
/** The keys or users a budget change applies to, at most one table page. */
const gatewaySpendLimitSubjectIdsInput = z
  .array(z.string())
  .min(1)
  .max(GATEWAY_SPEND_BUDGET_MAX_SUBJECTS)
  .transform((ids) => [...new Set(ids)]);

/** The Budgets table's search and status filter. */
const gatewayBudgetFilterInput = z.object({
  searchQuery: z.string().trim().optional(),
  status: z.enum(GATEWAY_BUDGET_STATUSES).default("all"),
});
/** Explicit keys or users, or every one matching a search and status, as the Budgets table lists them. */
const gatewayBudgetSubjectsInput = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ids"),
    subjectIds: gatewaySpendLimitSubjectIdsInput,
  }),
  gatewayBudgetFilterInput.extend({ type: z.literal("matching") }),
]);
/** A key without patterns, or with an empty list, may call every enabled model. */
const gatewayKeyAllowedModelsSchema = z
  .array(z.string().trim().min(1).max(500))
  .max(100)
  .nullish()
  .transform((patterns) =>
    patterns && patterns.length > 0 ? [...new Set(patterns)] : null,
  );

/** User budgets are for gateway managers only; members work with their own keys' budgets. */
function requireBudgetScopeAccess(
  session: Session,
  orgId: string,
  scope: "API_KEY" | "USER",
) {
  if (scope === "USER") {
    requireGatewayAdmin({ session, orgId });
    return;
  }
  requireGatewayInvoke({ session, orgId });
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
      const [config, hasSpendLimits] = await Promise.all([
        new GatewayConfigService(ctx.prisma).getConfig(input.orgId),
        new GatewaySpendLimitRepository(ctx.prisma).hasAny(input.orgId),
      ]);
      return { config, hasSpendLimits };
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
      const families = (connection: (typeof connections)[number]) => {
        if (
          connection.provider === "BEDROCK" ||
          connection.provider === "OPENROUTER" ||
          connection.provider === "VERCEL" ||
          connection.provider === "AZURE"
        ) {
          return ["OPENAI", "ANTHROPIC"] satisfies GatewayApiFamily[];
        }
        if (
          connection.provider === "XAI" ||
          connection.provider === "GOOGLE_AI_STUDIO" ||
          connection.provider === "VERTEX"
        ) {
          return ["OPENAI"] satisfies GatewayApiFamily[];
        }
        return [connection.provider];
      };
      return {
        gatewayBaseUrl: getGatewayBaseUrl(
          getProductBaseUrl(),
          env.LANGFUSE_AI_GATEWAY_PUBLIC_URL,
        ),
        // Agent clients call the OpenAI route with the Responses API, which
        // Google AI Studio and Vertex AI lack; plain API calls also work over Chat Completions.
        providers: [
          ...new Set(
            connections
              .filter(
                (connection) =>
                  connection.provider !== "GOOGLE_AI_STUDIO" &&
                  connection.provider !== "VERTEX",
              )
              .flatMap(families),
          ),
        ],
        apiProviders: [...new Set(connections.flatMap(families))],
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
        config: GatewayProviderConfigSchema.optional(),
        ...connectionEndpointInput,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      try {
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
        return { success: true as const, modelListingDenied };
      } catch (error) {
        // The admin is testing their own credential, so the provider's
        // answer is shown to them as is.
        if (error instanceof ProviderCredentialRejectedError) {
          return {
            success: false as const,
            providerResponse: error.providerResponse,
          };
        }
        throw error;
      }
    }),

  createConnection: protectedOrganizationProcedureWithoutTracing
    .input(
      organizationInput.extend({
        name: connectionNameSchema,
        provider: z.enum(GatewayProvider),
        credential: z.string().min(1),
        config: GatewayProviderConfigSchema.optional(),
        ...connectionEndpointInput,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
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
      // Readers see disabled models too; `listModelConnections` tells them which are enabled.
      return canManageGateway
        ? await catalogService.refreshAllModels(input.orgId)
        : await catalogService.listAllModels(input.orgId);
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

  /** Loaded after listApiKeys for the visible page, like getApiKeysLastUsed. */
  getApiKeysSpend: protectedOrganizationProcedure
    .input(
      organizationInput.extend({
        apiKeyIds: z.array(z.string()).max(100),
      }),
    )
    .query(async ({ input, ctx }) => {
      requireGatewayInvoke({ session: ctx.session, orgId: input.orgId });
      return new GatewaySpendLimitService(ctx.prisma).getApiKeysSpend({
        organizationId: input.orgId,
        usageScope: getGatewayUsageScope({
          session: ctx.session,
          orgId: input.orgId,
        }),
        apiKeyIds: input.apiKeyIds,
      });
    }),

  listBudgets: protectedOrganizationProcedure
    .input(
      offsetPaginatedOrganizationInput.extend({
        scope: gatewaySpendLimitScopeInput,
        ...gatewayBudgetFilterInput.shape,
      }),
    )
    .query(async ({ input, ctx }) => {
      requireBudgetScopeAccess(ctx.session, input.orgId, input.scope);
      return new GatewaySpendLimitService(ctx.prisma).listBudgets({
        organizationId: input.orgId,
        usageScope: getGatewayUsageScope({
          session: ctx.session,
          orgId: input.orgId,
        }),
        scope: input.scope,
        searchQuery: input.searchQuery,
        status: input.status,
        page: input.page,
        limit: input.limit,
      });
    }),

  /** Gives each key or user without one the same budget; members only their own keys. */
  createSpendLimits: protectedOrganizationProcedure
    .input(
      organizationInput.extend({
        scope: gatewaySpendLimitScopeInput,
        subjectIds: gatewaySpendLimitSubjectIdsInput,
        spendLimit: gatewaySpendLimitInput,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // User budgets are for gateway managers; members budget their own keys.
      if (input.scope === "USER") {
        requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      } else {
        requireGatewayInvoke({ session: ctx.session, orgId: input.orgId });
      }
      await new GatewaySpendLimitService(ctx.prisma).createForSubjects({
        organizationId: input.orgId,
        usageScope: getGatewayUsageScope({
          session: ctx.session,
          orgId: input.orgId,
        }),
        scope: input.scope,
        subjectIds: input.subjectIds,
        limit: input.spendLimit,
        session: ctx.session,
      });
    }),

  /**
   * Replaces the budget of each key or user; null removes it. Only gateway
   * managers may change user budgets; members may change only budgets they set
   * on their own keys.
   */
  setSpendLimits: protectedOrganizationProcedure
    .input(
      organizationInput.extend({
        scope: gatewaySpendLimitScopeInput,
        subjects: gatewayBudgetSubjectsInput,
        spendLimit: gatewaySpendLimitInput.nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      requireBudgetScopeAccess(ctx.session, input.orgId, input.scope);
      const service = new GatewaySpendLimitService(ctx.prisma);
      const usageScope = getGatewayUsageScope({
        session: ctx.session,
        orgId: input.orgId,
      });
      const subjectIds =
        input.subjects.type === "ids"
          ? input.subjects.subjectIds
          : (
              await service.listMatchingSubjects({
                organizationId: input.orgId,
                usageScope,
                scope: input.scope,
                searchQuery: input.subjects.searchQuery,
                status: input.subjects.status,
              })
            ).map(({ subjectId }) => subjectId);
      if (subjectIds.length > GATEWAY_SPEND_BUDGET_MAX_MATCHING_SUBJECTS) {
        throw new InvalidRequestError(
          `Budgets can change for at most ${GATEWAY_SPEND_BUDGET_MAX_MATCHING_SUBJECTS} keys or users at once. Narrow the search or status filter.`,
        );
      }
      await service.setForSubjects({
        organizationId: input.orgId,
        usageScope,
        scope: input.scope,
        subjectIds,
        limit: input.spendLimit,
        session: ctx.session,
      });
    }),

  /** Every key or user matching a search and status, for the spend chart when all of them are selected. */
  listMatchingBudgetSubjects: protectedOrganizationProcedure
    .input(
      organizationInput.extend({
        scope: gatewaySpendLimitScopeInput,
        ...gatewayBudgetFilterInput.shape,
      }),
    )
    .query(async ({ input, ctx }) => {
      requireBudgetScopeAccess(ctx.session, input.orgId, input.scope);
      const subjects = await new GatewaySpendLimitService(
        ctx.prisma,
      ).listMatchingSubjects({
        organizationId: input.orgId,
        usageScope: getGatewayUsageScope({
          session: ctx.session,
          orgId: input.orgId,
        }),
        scope: input.scope,
        searchQuery: input.searchQuery,
        status: input.status,
      });
      return subjects.map(({ subjectId, name }) => ({ id: subjectId, name }));
    }),

  getDefaultSpendLimits: protectedOrganizationProcedure
    .input(organizationInput)
    .query(async ({ input, ctx }) => {
      requireGatewayInvoke({ session: ctx.session, orgId: input.orgId });
      return new GatewaySpendLimitService(ctx.prisma).getDefaults(input.orgId);
    }),

  /** Sets or removes (null) the default budget of keys or users without their own. */
  setDefaultSpendLimit: protectedOrganizationProcedure
    .input(
      organizationInput.extend({
        scope: gatewaySpendLimitScopeInput,
        spendLimit: gatewaySpendLimitInput.nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      await new GatewaySpendLimitService(ctx.prisma).setDefault({
        organizationId: input.orgId,
        scope: input.scope,
        limit: input.spendLimit,
        session: ctx.session,
      });
    }),

  /** The organization's own budget, capping all of its gateway spend, with its spend; null when none is set. */
  getOrganizationSpendLimit: protectedOrganizationProcedure
    .input(organizationInput)
    .query(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      return new GatewaySpendLimitService(ctx.prisma).getOrganizationBudget(
        input.orgId,
      );
    }),

  /** Sets or removes (null) the organization's own budget. */
  setOrganizationSpendLimit: protectedOrganizationProcedure
    .input(
      organizationInput.extend({
        spendLimit: gatewaySpendLimitInput.nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({ session: ctx.session, orgId: input.orgId });
      await new GatewaySpendLimitService(ctx.prisma).setOrganizationBudget({
        organizationId: input.orgId,
        limit: input.spendLimit,
        session: ctx.session,
      });
    }),

  // Returns the plaintext secret key once, so the procedure must not be traced.
  createApiKey: protectedOrganizationProcedureWithoutTracing
    .input(
      organizationInput.extend({
        name: z.string().trim().min(1, "Gateway keys need a name").max(500),
        metadata: GatewayMetadataSchema.default({}),
        allowedModels: gatewayKeyAllowedModelsSchema,
        expiresAt: z
          .date()
          .nullish()
          .refine((date) => date == null || date.getTime() > Date.now(), {
            message: "Expiration date must be in the future",
          }),
        issuedAs: z.enum(["user", "serviceAccount"]).default("user"),
        spendLimit: gatewaySpendLimitInput.nullish(),
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
      const spendLimits = new GatewaySpendLimitService(ctx.prisma);
      if (input.spendLimit) {
        await spendLimits.requireAvailable(input.orgId);
      }
      const apiKeys = new GatewayApiKeyService(ctx.prisma, redis);
      const key = await apiKeys.create({
        organizationId: input.orgId,
        name: input.name,
        metadata: input.metadata,
        allowedModels: input.allowedModels,
        expiresAt: input.expiresAt,
        issuedAs: input.issuedAs,
        session: ctx.session,
      });
      if (input.spendLimit) {
        try {
          await spendLimits.setForApiKey({
            organizationId: input.orgId,
            usageScope: getGatewayUsageScope({
              session: ctx.session,
              orgId: input.orgId,
            }),
            apiKeyId: key.id,
            limit: input.spendLimit,
            session: ctx.session,
          });
        } catch (error) {
          // A key asked for with a budget must not stay usable without one.
          await apiKeys.revoke({
            organizationId: input.orgId,
            apiKeyId: key.id,
            session: ctx.session,
          });
          throw error;
        }
      }
      return key;
    }),

  updateApiKey: protectedOrganizationProcedure
    .input(
      connectionInput.extend({
        name: z.string().trim().min(1, "Gateway keys need a name").max(500),
        metadata: GatewayMetadataSchema,
        allowedModels: gatewayKeyAllowedModelsSchema,
        /** The patterns the editor loaded; the write is rejected if they changed since. */
        previousAllowedModels: z.array(z.string()).nullable(),
        /** Null removes the key's spend limits; omitted leaves them unchanged. */
        spendLimit: gatewaySpendLimitInput.nullish(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      requireGatewayInvoke({ session: ctx.session, orgId: input.orgId });
      const usageScope = getGatewayUsageScope({
        session: ctx.session,
        orgId: input.orgId,
      });
      const setSpendLimit =
        input.spendLimit === undefined
          ? undefined
          : await new GatewaySpendLimitService(ctx.prisma).prepareSetForApiKey({
              organizationId: input.orgId,
              usageScope,
              apiKeyId: input.id,
              limit: input.spendLimit,
              session: ctx.session,
            });
      const updated = await new GatewayApiKeyService(ctx.prisma, redis).update({
        organizationId: input.orgId,
        ownerUserId: getKeyOwnerFilter(usageScope),
        apiKeyId: input.id,
        name: input.name,
        metadata: input.metadata,
        allowedModels: input.allowedModels,
        previousAllowedModels: input.previousAllowedModels,
        session: ctx.session,
      });
      await setSpendLimit?.();
      return updated;
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
