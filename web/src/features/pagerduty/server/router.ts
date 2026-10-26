import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  PagerDutyIntegrationNameSchema,
  PagerDutyRegionSchema,
  PagerDutyRoutingKeySchema,
} from "@langfuse/shared/pagerduty";
import { PagerDutyApiError } from "@langfuse/shared/pagerduty/server";
import { logger } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/server";
import {
  createPagerDutyIntegration,
  deletePagerDutyIntegration,
  listPagerDutyIntegrations,
  sendPagerDutyTestEvent,
  updatePagerDutyIntegration,
} from "@/src/features/pagerduty/server/pagerDutyIntegrationService";
import { throwIfNoProjectAccess } from "@/src/features/rbac";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";

/** toTestEventError maps a failed PagerDuty call to a user-facing tRPC error. */
function toTestEventError(error: unknown, projectId: string): unknown {
  if (!(error instanceof PagerDutyApiError)) return error;
  logger.warn("Failed to send PagerDuty test event", {
    projectId,
    status: error.status,
    error: error.message,
  });
  if (error.status === 429) {
    return new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "PagerDuty rate-limited the test event. Try again shortly.",
    });
  }
  return new TRPCError({
    code: "BAD_REQUEST",
    message: `PagerDuty did not accept the test event. Check the routing key and region. (${error.message})`,
  });
}

/** pagerDutyRouter manages a project's PagerDuty routing keys. */
export const pagerDutyRouter = createTRPCRouter({
  list: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:read",
      });
      return listPagerDutyIntegrations(input.projectId);
    }),

  create: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: PagerDutyIntegrationNameSchema,
        routingKey: PagerDutyRoutingKeySchema,
        region: PagerDutyRegionSchema.default("US"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "integrations:CRUD",
      });
      const integration = await createPagerDutyIntegration({
        ...input,
        createdByUserId: ctx.session.user.id,
      });
      await auditLog({
        session: ctx.session,
        resourceType: "pagerDutyIntegration",
        resourceId: integration.id,
        action: "create",
        after: integration,
      });
      return integration;
    }),

  update: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        id: z.string(),
        name: PagerDutyIntegrationNameSchema.optional(),
        routingKey: PagerDutyRoutingKeySchema.optional(),
        region: PagerDutyRegionSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "integrations:CRUD",
      });
      const { before, after } = await updatePagerDutyIntegration(input);
      await auditLog({
        session: ctx.session,
        resourceType: "pagerDutyIntegration",
        resourceId: after.id,
        action: "update",
        before,
        after,
      });
      return after;
    }),

  delete: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "integrations:CRUD",
      });
      const before = await deletePagerDutyIntegration(input);
      await auditLog({
        session: ctx.session,
        resourceType: "pagerDutyIntegration",
        resourceId: before.id,
        action: "delete",
        before,
      });
      return { success: true };
    }),

  sendTestEvent: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:CUD",
      });
      try {
        await sendPagerDutyTestEvent(input);
      } catch (error) {
        throw toTestEventError(error, input.projectId);
      }
      await auditLog({
        session: ctx.session,
        resourceType: "pagerDutyIntegration",
        resourceId: input.id,
        action: "create",
        after: { action: "test_event_sent" },
      });
      return { success: true };
    }),
});
