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
import { ProviderCredentialRejectedError } from "@/src/features/ai-gateway/server/provider/connection/ProviderCredentialRejectedError";
import {
  GatewayBedrockGuardrailCreateInputSchema,
  GatewayBedrockGuardrailUpdateInputSchema,
  GatewayGuardrailAssignmentsInputSchema,
  GatewayGuardrailContainsListSchema,
  GatewayGuardrailPresetSchema,
  GatewayGuardrailRedactionLabelSchema,
  GatewayGuardrailSecretPrefixesSchema,
  GatewayGuardrailUiActionSchema,
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
  action: GatewayGuardrailUiActionSchema,
  redactionLabel: z.string().optional(),
  assignments: assignmentsInput,
};

const regexWriteFields = {
  type: z.literal("REGEX"),
  presets: z.array(GatewayGuardrailPresetSchema).default([]),
  secretPrefixes: GatewayGuardrailSecretPrefixesSchema.default([]),
  containsWords: GatewayGuardrailContainsListSchema.default([]),
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

function refineGuardrailWriteInput(
  value: {
    type: "REGEX" | "BEDROCK";
    action: "BLOCK" | "LOG" | "REDACT";
    redactionLabel?: string;
    presets?: unknown[];
    secretPrefixes?: unknown[];
    containsWords?: unknown[];
  },
  ctx: z.RefinementCtx,
) {
  if (
    value.type === "REGEX" &&
    !hasGuardrailRule({
      presets: value.presets ?? [],
      secretPrefixes: value.secretPrefixes ?? [],
      containsWords: value.containsWords ?? [],
    })
  ) {
    ctx.addIssue({
      code: "custom",
      message: GUARDRAIL_RULE_REQUIRED_MESSAGE,
    });
  }
  if (value.action === "REDACT" && value.redactionLabel !== undefined) {
    const labelResult = GatewayGuardrailRedactionLabelSchema.safeParse(
      value.redactionLabel,
    );
    if (!labelResult.success) {
      ctx.addIssue({
        code: "custom",
        path: ["redactionLabel"],
        message:
          labelResult.error.issues[0]?.message ??
          "Enter a valid replacement label",
      });
    }
  }
}

const createGuardrailInput = z
  .discriminatedUnion("type", [
    organizationInput.extend(commonWriteFields).extend(regexWriteFields),
    organizationInput.extend(commonWriteFields).extend({
      type: z.literal("BEDROCK"),
      bedrock: GatewayBedrockGuardrailCreateInputSchema,
    }),
  ])
  .superRefine(refineGuardrailWriteInput);

const updateGuardrailInput = z
  .discriminatedUnion("type", [
    guardrailIdInput.extend(commonWriteFields).extend(regexWriteFields),
    guardrailIdInput.extend(commonWriteFields).extend({
      type: z.literal("BEDROCK"),
      bedrock: GatewayBedrockGuardrailUpdateInputSchema,
    }),
  ])
  .superRefine(refineGuardrailWriteInput);

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

  test: protectedOrganizationProcedureWithoutTracing
    .input(
      organizationInput.extend({
        id: z.string().optional(),
        type: z.literal("BEDROCK"),
        bedrock: GatewayBedrockGuardrailUpdateInputSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      requireGatewayGuardrailsAdmin({
        session: ctx.session,
        orgId: input.orgId,
      });
      try {
        return await new GatewayGuardrailService(ctx.prisma).test({
          organizationId: input.orgId,
          id: input.id,
          type: input.type,
          bedrock: input.bedrock,
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
      requireGatewayGuardrailsAdmin({
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
          redactionLabel: input.redactionLabel,
          bedrock: input.bedrock,
          assignments: input.assignments,
          session: ctx.session,
        });
      }
      return service.create({
        organizationId: input.orgId,
        type: "REGEX",
        name: input.name,
        action: input.action,
        redactionLabel: input.redactionLabel,
        presets: input.presets,
        secretPrefixes: input.secretPrefixes,
        containsWords: input.containsWords,
        assignments: input.assignments,
        session: ctx.session,
      });
    }),

  update: protectedOrganizationProcedureWithoutTracing
    .input(updateGuardrailInput)
    .mutation(async ({ input, ctx }) => {
      requireGatewayGuardrailsAdmin({
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
          redactionLabel: input.redactionLabel,
          bedrock: input.bedrock,
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
        redactionLabel: input.redactionLabel,
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
