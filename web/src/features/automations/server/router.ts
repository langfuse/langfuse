import { createTRPCRouter } from "@/src/server/api/trpc";
import { protectedProjectProcedure } from "@/src/server/api/trpc";
import { z } from "zod/v4";
import {
  ActionCreateSchema,
  ActionType,
  ActionTypeSchema,
  JobConfigState,
} from "@langfuse/shared";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { v4 } from "uuid";
import {
  getActionById,
  getAutomations,
  getAutomationById,
  getConsecutiveAutomationFailures,
  logger,
} from "@langfuse/shared/src/server";
import { generateWebhookSecret, encrypt } from "@langfuse/shared/encryption";
import { processWebhookActionConfig } from "./webhookHelpers";
import { TRPCError } from "@trpc/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";

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
  automationId: z.string(),
});

export const automationsRouter = createTRPCRouter({
  // Get automations that were recently auto-disabled due to failures
  getCountOfConsecutiveFailures: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        automationId: z.string(),
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
        automationId: input.automationId,
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

      await auditLog({
        session: ctx.session,
        resourceType: "action",
        resourceId: input.actionId,
        action: "update",
        before: {
          displaySecretKey: existingAction.config.displaySecretKey,
        },
        after: {
          displaySecretKey: newDisplaySecretKey,
        },
      });

      // Update action config with new secret
      const updatedConfig = {
        ...(existingAction.config as any),
        secretKey: encrypt(newSecretKey),
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

  // Get a single automation by automation ID
  getAutomation: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        automationId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Check if user has at least read access to automations
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:read",
      });

      const automation = await getAutomationById({
        projectId: input.projectId,
        automationId: input.automationId,
      });

      if (!automation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Automation with id ${input.automationId} not found.`,
        });
      }

      return automation;
    }),

  // Get execution history for an automation
  getAutomationExecutions: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        automationId: z.string(),
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

      // First get the automation to extract triggerId and actionId
      const automation = await getAutomationById({
        projectId: input.projectId,
        automationId: input.automationId,
      });

      if (!automation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Automation with id ${input.automationId} not found.`,
        });
      }

      const executions = await ctx.prisma.automationExecution.findMany({
        where: {
          projectId: ctx.session.projectId,
          triggerId: automation.trigger.id,
          actionId: automation.action.id,
        },
        orderBy: {
          createdAt: "desc",
        },
        skip: input.page * input.limit,
        take: input.limit,
      });

      const totalCount = await ctx.prisma.automationExecution.count({
        where: {
          projectId: ctx.session.projectId,
          triggerId: automation.trigger.id,
          actionId: automation.action.id,
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

      const [trigger, action, automation] = await ctx.prisma.$transaction(
        async (tx) => {
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
            },
          });

          // Create the automation
          const automation = await tx.automation.create({
            data: {
              projectId: ctx.session.projectId,
              triggerId: triggerId,
              actionId: actionId,
              name: input.name,
            },
          });

          return [trigger, action, automation];
        },
      );

      await auditLog({
        session: ctx.session,
        resourceType: "automation",
        resourceId: trigger.id,
        action: "create",
        before: undefined,
        after: {
          automation,
          action: action,
          trigger: trigger,
        },
      });

      logger.info(`Created automation ${trigger.id} for action ${action.id}`);

      return {
        action,
        trigger,
        automation,
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

      const existingAutomation = await getAutomationById({
        projectId: input.projectId,
        automationId: input.automationId,
      });

      if (!existingAutomation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Automation with id ${input.automationId} not found.`,
        });
      }

      // Process webhook action configuration using helper
      const { finalActionConfig } = await processWebhookActionConfig({
        actionConfig: input.actionConfig,
        actionId: existingAutomation.action.id,
        projectId: input.projectId,
      });

      const [action, trigger, automation] = await ctx.prisma.$transaction(
        async (tx) => {
          // Update the action
          const action = await tx.action.update({
            where: {
              id: existingAutomation.action.id,
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
              id: existingAutomation.trigger.id,
              projectId: ctx.session.projectId,
            },
            data: {
              eventSource: input.eventSource,
              eventActions: input.eventAction,
              filter: input.filter || [],
              status: input.status,
            },
          });

          // Update the automation name in Automation
          await tx.automation.update({
            where: {
              id: input.automationId,
              projectId: ctx.session.projectId,
            },
            data: {
              name: input.name,
            },
          });

          // Get the updated automation
          const automation = await tx.automation.findFirst({
            where: {
              id: input.automationId,
              projectId: ctx.session.projectId,
            },
          });

          return [action, trigger, automation];
        },
      );

      await auditLog({
        session: ctx.session,
        resourceType: "automation",
        resourceId: trigger.id,
        action: "update",
        before: {
          automation: existingAutomation,
          action: existingAutomation.action,
          trigger: existingAutomation.trigger,
        },
        after: {
          automation: automation,
          action: action,
          trigger: trigger,
        },
      });

      return { action, trigger, automation };
    }),

  // Delete an automation (both trigger and action)
  deleteAutomation: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        automationId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user has create/update/delete access to automations
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:CUD",
      });

      const existingAutomation = await getAutomationById({
        projectId: input.projectId,
        automationId: input.automationId,
      });

      if (!existingAutomation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Automation with id ${input.automationId} not found.`,
        });
      }

      await ctx.prisma.$transaction(async (tx) => {
        await tx.automation.delete({
          where: {
            id: input.automationId,
            projectId: ctx.session.projectId,
          },
        });

        await tx.automationExecution.deleteMany({
          where: {
            triggerId: existingAutomation.trigger.id,
            actionId: existingAutomation.action.id,
          },
        });

        await tx.action.delete({
          where: {
            id: existingAutomation.action.id,
            projectId: ctx.session.projectId,
          },
        });

        await tx.trigger.delete({
          where: {
            id: existingAutomation.trigger.id,
            projectId: ctx.session.projectId,
          },
        });

        await auditLog({
          session: ctx.session,
          resourceType: "automation",
          resourceId: input.automationId,
          action: "delete",
          before: existingAutomation,
        });
      });
    }),

  count: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), type: ActionTypeSchema }))
    .query(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:read",
      });

      const count = await ctx.prisma.action.count({
        where: {
          projectId: input.projectId,
          ...(input.type === "WEBHOOK" && { type: "WEBHOOK" }),
        },
      });

      return count;
    }),
});
