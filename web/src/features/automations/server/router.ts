import { createTRPCRouter } from "@/src/server/api/trpc";
import { protectedProjectProcedure } from "@/src/server/api/trpc";
import { z } from "zod/v4";
import {
  ActionCreateSchema,
  ActionType,
  JobConfigState,
} from "@langfuse/shared";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { v4 } from "uuid";
import {
  getActionById,
  getAutomations,
  getConsecutiveAutomationFailures,
  logger,
} from "@langfuse/shared/src/server";
import { generateWebhookSecret } from "@langfuse/shared/encryption";
import { processWebhookActionConfig } from "./webhookHelpers";
import { TRPCError } from "@trpc/server";

export const CreateAutomationInputSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1, "Name is required"),
  eventSource: z.string(),
  eventAction: z.array(z.string()),
  filter: z.array(z.any()).nullable(),
  status: z.enum(JobConfigState).default(JobConfigState.ACTIVE),
  // Action fields
  actionType: z.enum(ActionType),
  actionConfig: ActionCreateSchema,
});

export const UpdateAutomationInputSchema = CreateAutomationInputSchema.extend({
  triggerId: z.string(),
  actionId: z.string(),
});

export const automationsRouter = createTRPCRouter({
  // Get automations that were recently auto-disabled due to failures
  getCountOfConsecutiveFailures: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        triggerId: z.string(),
        actionId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Check if user has at least read access to automations
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:read",
      });

      const recentlyDisabled = await getConsecutiveAutomationFailures({
        triggerId: input.triggerId,
        actionId: input.actionId,
        projectId: input.projectId,
      });

      return { count: recentlyDisabled };
    }),

  // Regenerate webhook secret for an automation
  regenerateWebhookSecret: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        actionId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user has create/update/delete access to automations
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:CUD",
      });

      // Get existing action
      const existingAction = await getActionById({
        projectId: input.projectId,
        actionId: input.actionId,
      });

      if (!existingAction || existingAction.type !== "WEBHOOK") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Action with id ${input.actionId} not found.`,
        });
      }

      // Generate new webhook secret
      const { secretKey: newSecretKey, displaySecretKey: newDisplaySecretKey } =
        generateWebhookSecret();

      // Update action config with new secret
      const updatedConfig = {
        ...(existingAction.config as any),
        secretKey: newSecretKey,
        displaySecretKey: newDisplaySecretKey,
      };

      await ctx.prisma.action.update({
        where: { id: input.actionId, projectId: ctx.session.projectId },
        data: { config: updatedConfig },
      });

      return {
        displaySecretKey: newDisplaySecretKey,
        webhookSecret: newSecretKey, // Return full secret for one-time display
      };
    }),

  getAutomations: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Check if user has at least read access to automations
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:read",
      });

      return await getAutomations({
        projectId: input.projectId,
      });
    }),

  // Get a single automation by trigger and action ID
  getAutomation: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        triggerId: z.string(),
        actionId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Check if user has at least read access to automations
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:read",
      });

      const automations = await getAutomations({
        projectId: input.projectId,
        triggerId: input.triggerId,
        actionId: input.actionId,
      });

      if (automations.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Automation with id ${input.actionId} not found.`,
        });
      }

      return automations[0];
    }),

  // Get execution history for an automation
  getAutomationExecutions: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        triggerId: z.string(),
        actionId: z.string(),
        page: z.number().min(0).default(0),
        limit: z.number().min(1).max(1000).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Check if user has at least read access to automations
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:read",
      });

      const executions = await ctx.prisma.actionExecution.findMany({
        where: {
          projectId: ctx.session.projectId,
          triggerId: input.triggerId,
          actionId: input.actionId,
        },
        orderBy: {
          createdAt: "desc",
        },
        skip: input.page * input.limit,
        take: input.limit,
      });

      const totalCount = await ctx.prisma.actionExecution.count({
        where: {
          projectId: ctx.session.projectId,
          triggerId: input.triggerId,
          actionId: input.actionId,
        },
      });

      return {
        executions,
        totalCount,
      };
    }),

  // Combined route that creates both an action and a trigger
  createAutomation: protectedProjectProcedure
    .input(CreateAutomationInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Check if user has create/update/delete access to automations
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:CUD",
      });

      const triggerId = v4();
      const actionId = v4();

      // Process webhook action configuration using helper
      const { finalActionConfig, newUnencryptedWebhookSecret } =
        await processWebhookActionConfig({
          actionConfig: input.actionConfig,
          projectId: input.projectId,
        });

      const [trigger, action] = await ctx.prisma.$transaction(async (tx) => {
        const trigger = await tx.trigger.create({
          data: {
            id: triggerId,
            projectId: ctx.session.projectId,
            eventSource: input.eventSource,
            eventActions: input.eventAction,
            filter: input.filter || [],
            status: input.status,
          },
        });

        // First create the action
        const action = await tx.action.create({
          data: {
            id: actionId,
            projectId: ctx.session.projectId,
            type: input.actionType,
            config: finalActionConfig,
            triggers: {
              create: [
                {
                  projectId: ctx.session.projectId,
                  triggerId: triggerId,
                  name: input.name,
                },
              ],
            },
          },
        });

        return [trigger, action];
      });

      logger.info(`Created automation ${trigger.id} for action ${action.id}`);

      return {
        action,
        trigger,
        webhookSecret: newUnencryptedWebhookSecret, // Return webhook secret at top level for one-time display
      };
    }),

  // Update an existing automation
  updateAutomation: protectedProjectProcedure
    .input(UpdateAutomationInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Check if user has create/update/delete access to automations
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:CUD",
      });

      // Process webhook action configuration using helper
      const { finalActionConfig } = await processWebhookActionConfig({
        actionConfig: input.actionConfig,
        actionId: input.actionId,
        projectId: input.projectId,
      });

      const [action, trigger] = await ctx.prisma.$transaction(async (tx) => {
        // Update the action
        const action = await tx.action.update({
          where: {
            id: input.actionId,
            projectId: ctx.session.projectId,
          },
          data: {
            type: input.actionType,
            config: finalActionConfig,
          },
        });

        // Update the trigger
        const trigger = await tx.trigger.update({
          where: {
            id: input.triggerId,
            projectId: ctx.session.projectId,
          },
          data: {
            eventSource: input.eventSource,
            eventActions: input.eventAction,
            filter: input.filter || [],
            status: input.status,
          },
        });

        // Update the automation name in TriggersOnActions
        await tx.triggersOnActions.update({
          where: {
            triggerId_actionId: {
              triggerId: input.triggerId,
              actionId: input.actionId,
            },
          },
          data: {
            name: input.name,
          },
        });

        return [action, trigger];
      });

      return { action, trigger };
    }),

  // Delete an automation (both trigger and action)
  deleteAutomation: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        triggerId: z.string(),
        actionId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user has create/update/delete access to automations
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:CUD",
      });
      await ctx.prisma.$transaction(async (tx) => {
        await tx.triggersOnActions.delete({
          where: {
            triggerId_actionId: {
              triggerId: input.triggerId,
              actionId: input.actionId,
            },
            projectId: ctx.session.projectId,
          },
        });

        await tx.actionExecution.deleteMany({
          where: {
            triggerId: input.triggerId,
            actionId: input.actionId,
          },
        });

        await tx.action.delete({
          where: {
            id: input.actionId,
            projectId: ctx.session.projectId,
          },
        });

        await tx.trigger.delete({
          where: {
            id: input.triggerId,
            projectId: ctx.session.projectId,
          },
        });
      });
    }),
});
