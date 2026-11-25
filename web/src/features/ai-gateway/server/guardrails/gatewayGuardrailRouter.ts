import { z } from "zod/v4";

import {
  GATEWAY_GUARDRAIL_MAX_BULK_DELETE,
  GATEWAY_GUARDRAIL_MAX_NAME_LENGTH,
  GATEWAY_GUARDRAIL_MAX_TARGETS,
  GATEWAY_GUARDRAIL_TARGET_SEARCH_LIMIT,
} from "@/src/features/ai-gateway/constants/gatewayGuardrails";
import {
  requireGatewayGuardrailsAdmin,
  requireGatewayGuardrailsRead,
} from "@/src/features/ai-gateway/server/gatewayAccess";
import { GatewayGuardrailService } from "@/src/features/ai-gateway/server/guardrails/gatewayGuardrailService";
import {
  GatewayGuardrailAssignmentsInputSchema,
  GatewayGuardrailContainsListSchema,
  GatewayGuardrailPresetSchema,
  GatewayGuardrailSecretPrefixesSchema,
  GatewayGuardrailUiActionSchema,
} from "@/src/features/ai-gateway/types/gatewayGuardrail";
import { hasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
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

const writeFields = {
  name: z
    .string()
    .trim()
    .min(1, "Guardrails need a name")
    .max(GATEWAY_GUARDRAIL_MAX_NAME_LENGTH),
  action: GatewayGuardrailUiActionSchema,
  presets: z.array(GatewayGuardrailPresetSchema).default([]),
  secretPrefixes: GatewayGuardrailSecretPrefixesSchema.default([]),
  containsWords: GatewayGuardrailContainsListSchema.default([]),
  assignments: assignmentsInput,
};

const hasGuardrailRule = (value: {
  presets: unknown[];
  secretPrefixes: unknown[];
  containsWords: unknown[];
}) =>
  value.presets.length > 0 ||
  value.secretPrefixes.length > 0 ||
  value.containsWords.length > 0;

const GUARDRAIL_RULE_REQUIRED_MESSAGE =
  "Configure at least one pattern, prefix, or keyword to detect";

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
      requireGatewayGuardrailsAdmin({
        session: ctx.session,
        orgId: input.orgId,
      });
      return new GatewayGuardrailService(ctx.prisma).searchTargets({
        organizationId: input.orgId,
        searchQuery: input.searchQuery || undefined,
        limit: GATEWAY_GUARDRAIL_TARGET_SEARCH_LIMIT,
      });
    }),

  create: protectedOrganizationProcedure
    .input(
      organizationInput
        .extend(writeFields)
        .refine(hasGuardrailRule, GUARDRAIL_RULE_REQUIRED_MESSAGE),
    )
    .mutation(async ({ input, ctx }) => {
      requireGatewayGuardrailsAdmin({
        session: ctx.session,
        orgId: input.orgId,
      });
      return new GatewayGuardrailService(ctx.prisma).create({
        organizationId: input.orgId,
        name: input.name,
        action: input.action,
        presets: input.presets,
        secretPrefixes: input.secretPrefixes,
        containsWords: input.containsWords,
        assignments: input.assignments,
        session: ctx.session,
      });
    }),

  update: protectedOrganizationProcedure
    .input(
      guardrailIdInput
        .extend(writeFields)
        .refine(hasGuardrailRule, GUARDRAIL_RULE_REQUIRED_MESSAGE),
    )
    .mutation(async ({ input, ctx }) => {
      requireGatewayGuardrailsAdmin({
        session: ctx.session,
        orgId: input.orgId,
      });
      return new GatewayGuardrailService(ctx.prisma).update({
        organizationId: input.orgId,
        id: input.id,
        name: input.name,
        action: input.action,
        presets: input.presets,
        secretPrefixes: input.secretPrefixes,
        containsWords: input.containsWords,
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
      requireGatewayGuardrailsAdmin({
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
      requireGatewayGuardrailsAdmin({
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
