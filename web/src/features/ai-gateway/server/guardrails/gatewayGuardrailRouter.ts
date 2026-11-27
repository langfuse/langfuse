import { z } from "zod/v4";

import {
  GATEWAY_GUARDRAIL_MAX_BULK_DELETE,
  GATEWAY_GUARDRAIL_MAX_CUSTOM_REGEX_LENGTH,
  GATEWAY_GUARDRAIL_MAX_NAME_LENGTH,
  GATEWAY_GUARDRAIL_MAX_TARGETS,
  GATEWAY_GUARDRAIL_PREVIEW_TEXT_MAX_LENGTH,
  GATEWAY_GUARDRAIL_TARGET_SEARCH_LIMIT,
} from "@/src/features/ai-gateway/constants/gatewayGuardrails";
import {
  requireGatewayAdmin,
  requireGatewayGuardrailsRead,
} from "@/src/features/ai-gateway/server/gatewayAccess";
import { GatewayGuardrailService } from "@/src/features/ai-gateway/server/guardrails/gatewayGuardrailService";
import { ProviderCredentialRejectedError } from "@/src/features/ai-gateway/server/provider/connection/ProviderCredentialRejectedError";
import {
  GATEWAY_GUARDRAIL_ACTION_SCOPES,
  GATEWAY_GUARDRAIL_TYPE_CAPABILITIES,
  GatewayBedrockGuardrailCreateInputSchema,
  GatewayBedrockGuardrailUpdateInputSchema,
  GatewayGuardrailAssignmentsInputSchema,
  GatewayGuardrailContainsListSchema,
  GatewayGuardrailCustomRegexSchema,
  GatewayGuardrailPresetSchema,
  GatewayGuardrailRedactionLabelSchema,
  GatewayGuardrailScopeSchema,
  GatewayGuardrailSecretPrefixesSchema,
  GatewayOpenAiModerationGuardrailCreateInputSchema,
  GatewayOpenAiModerationGuardrailUpdateInputSchema,
} from "@/src/features/ai-gateway/types/gatewayGuardrail";
import { hasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
  protectedOrganizationProcedureWithoutTracing,
} from "@/src/server/api/trpc";

const organizationInput = z.object({ orgId: z.string() });
const guardrailIdInput = organizationInput.extend({ id: z.string() });
const offsetPaginatedOrganizationInput = organizationInput.extend({
  page: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(50),
});

const assignmentsInput = GatewayGuardrailAssignmentsInputSchema.refine(
  (items) => items.length <= GATEWAY_GUARDRAIL_MAX_TARGETS,
  `Select at most ${GATEWAY_GUARDRAIL_MAX_TARGETS} targets`,
);

const commonWriteFields = {
  name: z
    .string()
    .trim()
    .min(1, "Guardrails need a name")
    .max(GATEWAY_GUARDRAIL_MAX_NAME_LENGTH),
  scope: GatewayGuardrailScopeSchema.optional(),
  assignments: assignmentsInput,
};

const regexRuleFields = {
  type: z.literal("REGEX"),
  presets: z.array(GatewayGuardrailPresetSchema).default([]),
  secretPrefixes: GatewayGuardrailSecretPrefixesSchema.default([]),
  containsWords: GatewayGuardrailContainsListSchema.default([]),
  customRegex: GatewayGuardrailCustomRegexSchema.optional(),
};

const hasGuardrailRule = (value: {
  presets: unknown[];
  secretPrefixes: unknown[];
  containsWords: unknown[];
  customRegex?: string;
}) =>
  value.presets.length > 0 ||
  value.secretPrefixes.length > 0 ||
  value.containsWords.length > 0 ||
  Boolean(value.customRegex);

const GUARDRAIL_RULE_REQUIRED_MESSAGE =
  "Configure at least one pattern, prefix, keyword, or custom regex to detect";

const regexWriteSchema = z
  .discriminatedUnion("action", [
    z.object({
      ...commonWriteFields,
      ...regexRuleFields,
      action: z.literal("REDACT"),
      redactionLabel: GatewayGuardrailRedactionLabelSchema.optional(),
    }),
    z.object({
      ...commonWriteFields,
      ...regexRuleFields,
      action: z.literal("BLOCK"),
      scope: z.enum(GATEWAY_GUARDRAIL_ACTION_SCOPES.BLOCK).optional(),
    }),
    z.object({
      ...commonWriteFields,
      ...regexRuleFields,
      action: z.literal("LOG"),
    }),
  ])
  .refine(hasGuardrailRule, GUARDRAIL_RULE_REQUIRED_MESSAGE);

const bedrockActionSchema = z.enum(
  GATEWAY_GUARDRAIL_TYPE_CAPABILITIES.BEDROCK.actions,
);

const openAiModerationActionSchema = z.enum(
  GATEWAY_GUARDRAIL_TYPE_CAPABILITIES.OPENAI_MODERATION.actions,
);

const isScopeSupportedByAction = (value: {
  action: keyof typeof GATEWAY_GUARDRAIL_ACTION_SCOPES;
  scope?: z.infer<typeof GatewayGuardrailScopeSchema>;
}) =>
  value.scope === undefined ||
  (GATEWAY_GUARDRAIL_ACTION_SCOPES[value.action] as readonly string[]).includes(
    value.scope,
  );

const SCOPE_NOT_SUPPORTED_MESSAGE =
  "Block guardrails only evaluate the last turn";

const createGuardrailInput = z.union([
  organizationInput.and(regexWriteSchema),
  organizationInput.extend({
    ...commonWriteFields,
    type: z.literal("BEDROCK"),
    action: bedrockActionSchema,
    bedrock: GatewayBedrockGuardrailCreateInputSchema,
  }),
  organizationInput
    .extend({
      ...commonWriteFields,
      type: z.literal("OPENAI_MODERATION"),
      action: openAiModerationActionSchema,
      openAiModeration: GatewayOpenAiModerationGuardrailCreateInputSchema,
    })
    .refine(isScopeSupportedByAction, SCOPE_NOT_SUPPORTED_MESSAGE),
]);

const updateGuardrailInput = z.union([
  guardrailIdInput.and(regexWriteSchema),
  guardrailIdInput.extend({
    ...commonWriteFields,
    type: z.literal("BEDROCK"),
    action: bedrockActionSchema,
    bedrock: GatewayBedrockGuardrailUpdateInputSchema,
  }),
  guardrailIdInput
    .extend({
      ...commonWriteFields,
      type: z.literal("OPENAI_MODERATION"),
      action: openAiModerationActionSchema,
      openAiModeration: GatewayOpenAiModerationGuardrailUpdateInputSchema,
    })
    .refine(isScopeSupportedByAction, SCOPE_NOT_SUPPORTED_MESSAGE),
]);

const bulkTargetInput = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ids"),
    ids: z
      .array(z.string().min(1))
      .min(1)
      .max(GATEWAY_GUARDRAIL_MAX_BULK_DELETE),
  }),
  z.object({
    type: z.literal("matching"),
    searchQuery: z.string().trim().optional(),
  }),
]);

const MIN_TIME_SERIES_TIMESTAMP = new Date("1970-01-01T00:00:00.000Z");
const MAX_TIME_SERIES_TIMESTAMP = new Date("2100-01-01T00:00:00.000Z");

export const gatewayGuardrailRouter = createTRPCRouter({
  list: protectedOrganizationProcedure
    .input(
      offsetPaginatedOrganizationInput.extend({
        searchQuery: z.string().trim().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      requireGatewayGuardrailsRead({
        session: ctx.session,
        orgId: input.orgId,
      });
      const canManageGateway = hasOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "gateway:manage",
      });
      return new GatewayGuardrailService(ctx.prisma).list({
        organizationId: input.orgId,
        searchQuery: input.searchQuery || undefined,
        page: input.page,
        limit: input.limit,
        viewer: { canManageGateway, userId: ctx.session.user.id },
      });
    }),

  listMatching: protectedOrganizationProcedure
    .input(
      organizationInput.extend({
        searchQuery: z.string().trim().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      requireGatewayGuardrailsRead({
        session: ctx.session,
        orgId: input.orgId,
      });
      return new GatewayGuardrailService(ctx.prisma).listMatching({
        organizationId: input.orgId,
        searchQuery: input.searchQuery || undefined,
      });
    }),

  getFlaggedTimeSeries: protectedOrganizationProcedure
    .input(
      organizationInput
        .extend({
          fromTimestamp: z
            .date()
            .min(MIN_TIME_SERIES_TIMESTAMP)
            .max(MAX_TIME_SERIES_TIMESTAMP),
          toTimestamp: z
            .date()
            .min(MIN_TIME_SERIES_TIMESTAMP)
            .max(MAX_TIME_SERIES_TIMESTAMP),
          granularity: z.enum(["day", "week", "month"]),
          selection: z
            .discriminatedUnion("type", [
              z.object({
                type: z.literal("ids"),
                ids: z.array(z.string().min(1)).max(100),
              }),
              z.object({
                type: z.literal("matching"),
                searchQuery: z.string().trim().optional(),
              }),
            ])
            .optional(),
        })
        .refine(
          ({ fromTimestamp, toTimestamp }) => fromTimestamp <= toTimestamp,
          "fromTimestamp must be before or equal to toTimestamp",
        ),
    )
    .query(async ({ input, ctx }) => {
      requireGatewayGuardrailsRead({
        session: ctx.session,
        orgId: input.orgId,
      });
      return new GatewayGuardrailService(ctx.prisma).getFlaggedTimeSeries({
        organizationId: input.orgId,
        fromTimestamp: input.fromTimestamp,
        toTimestamp: input.toTimestamp,
        granularity: input.granularity,
        selection: input.selection,
      });
    }),

  searchTargets: protectedOrganizationProcedure
    .input(
      organizationInput.extend({
        searchQuery: z.string().trim().max(200).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      requireGatewayAdmin({
        session: ctx.session,
        orgId: input.orgId,
      });
      return new GatewayGuardrailService(ctx.prisma).searchTargets({
        organizationId: input.orgId,
        searchQuery: input.searchQuery || undefined,
        limit: GATEWAY_GUARDRAIL_TARGET_SEARCH_LIMIT,
      });
    }),

  previewRegex: protectedOrganizationProcedureWithoutTracing
    .input(
      organizationInput.extend({
        pattern: z.string().max(GATEWAY_GUARDRAIL_MAX_CUSTOM_REGEX_LENGTH),
        text: z.string().max(GATEWAY_GUARDRAIL_PREVIEW_TEXT_MAX_LENGTH),
      }),
    )
    .query(({ input, ctx }) => {
      requireGatewayAdmin({
        session: ctx.session,
        orgId: input.orgId,
      });
      return new GatewayGuardrailService(ctx.prisma).previewRegex({
        pattern: input.pattern,
        text: input.text,
      });
    }),

  test: protectedOrganizationProcedureWithoutTracing
    .input(
      z.discriminatedUnion("type", [
        organizationInput.extend({
          id: z.string().optional(),
          type: z.literal("BEDROCK"),
          bedrock: GatewayBedrockGuardrailUpdateInputSchema,
        }),
        organizationInput.extend({
          id: z.string().optional(),
          type: z.literal("OPENAI_MODERATION"),
          openAiModeration: GatewayOpenAiModerationGuardrailUpdateInputSchema,
        }),
      ]),
    )
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({
        session: ctx.session,
        orgId: input.orgId,
      });
      try {
        const { orgId, ...params } = input;
        return await new GatewayGuardrailService(ctx.prisma).test({
          organizationId: orgId,
          ...params,
        });
      } catch (error) {
        if (error instanceof ProviderCredentialRejectedError) {
          return {
            success: false as const,
            providerResponse: error.providerResponse,
          };
        }
        throw error;
      }
    }),

  create: protectedOrganizationProcedureWithoutTracing
    .input(createGuardrailInput)
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({
        session: ctx.session,
        orgId: input.orgId,
      });
      const service = new GatewayGuardrailService(ctx.prisma);
      if (input.type === "BEDROCK") {
        return service.create({
          organizationId: input.orgId,
          type: "BEDROCK",
          name: input.name,
          action: input.action,
          scope: input.scope,
          bedrock: input.bedrock,
          assignments: input.assignments,
          session: ctx.session,
        });
      }
      if (input.type === "OPENAI_MODERATION") {
        return service.create({
          organizationId: input.orgId,
          type: "OPENAI_MODERATION",
          name: input.name,
          action: input.action,
          scope: input.scope,
          openAiModeration: input.openAiModeration,
          assignments: input.assignments,
          session: ctx.session,
        });
      }
      return service.create({
        organizationId: input.orgId,
        type: "REGEX",
        name: input.name,
        action: input.action,
        scope: input.scope,
        redactionLabel:
          input.action === "REDACT" ? input.redactionLabel : undefined,
        presets: input.presets,
        secretPrefixes: input.secretPrefixes,
        containsWords: input.containsWords,
        customRegex: input.customRegex,
        assignments: input.assignments,
        session: ctx.session,
      });
    }),

  update: protectedOrganizationProcedureWithoutTracing
    .input(updateGuardrailInput)
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({
        session: ctx.session,
        orgId: input.orgId,
      });
      const service = new GatewayGuardrailService(ctx.prisma);
      if (input.type === "BEDROCK") {
        return service.update({
          organizationId: input.orgId,
          id: input.id,
          type: "BEDROCK",
          name: input.name,
          action: input.action,
          scope: input.scope,
          bedrock: input.bedrock,
          assignments: input.assignments,
          session: ctx.session,
        });
      }
      if (input.type === "OPENAI_MODERATION") {
        return service.update({
          organizationId: input.orgId,
          id: input.id,
          type: "OPENAI_MODERATION",
          name: input.name,
          action: input.action,
          scope: input.scope,
          openAiModeration: input.openAiModeration,
          assignments: input.assignments,
          session: ctx.session,
        });
      }
      return service.update({
        organizationId: input.orgId,
        id: input.id,
        type: "REGEX",
        name: input.name,
        action: input.action,
        scope: input.scope,
        redactionLabel:
          input.action === "REDACT" ? input.redactionLabel : undefined,
        presets: input.presets,
        secretPrefixes: input.secretPrefixes,
        containsWords: input.containsWords,
        customRegex: input.customRegex,
        assignments: input.assignments,
        session: ctx.session,
      });
    }),

  setAssignments: protectedOrganizationProcedure
    .input(
      organizationInput.extend({
        target: bulkTargetInput,
        assignments: assignmentsInput,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({
        session: ctx.session,
        orgId: input.orgId,
      });
      return new GatewayGuardrailService(ctx.prisma).setAssignmentsForMany({
        organizationId: input.orgId,
        target: input.target,
        assignments: input.assignments,
        session: ctx.session,
      });
    }),

  delete: protectedOrganizationProcedure
    .input(
      organizationInput.extend({
        target: bulkTargetInput,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      requireGatewayAdmin({
        session: ctx.session,
        orgId: input.orgId,
      });
      return new GatewayGuardrailService(ctx.prisma).deleteMany({
        organizationId: input.orgId,
        target: input.target,
        session: ctx.session,
      });
    }),
});
