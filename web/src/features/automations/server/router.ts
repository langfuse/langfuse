import { createTRPCRouter } from "@/src/server/api/trpc";
import { protectedProjectProcedure } from "@/src/server/api/trpc";
import { z } from "zod";
import {
  ActionConfigSchema,
  ActionType,
  JobConfigState,
} from "@langfuse/shared";
import { Prisma } from "@prisma/client";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { v4 } from "uuid";
import { getActiveAutomations } from "@langfuse/shared/src/server";

export const automationsRouter = createTRPCRouter({
  getAutomations: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Check if user has at least read access to automations
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:read",
      });

      return getActiveAutomations({
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

      const automations = await getActiveAutomations({
        projectId: input.projectId,
        triggerId: input.triggerId,
        actionId: input.actionId,
      });

      if (automations.length === 0) {
        throw new Error("Automation not found");
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
    .input(
      z.object({
        projectId: z.string(),
        description: z.string().optional(),
        eventSource: z.string(),
        filter: z.array(z.any()).nullable(),
        status: z.nativeEnum(JobConfigState).default(JobConfigState.ACTIVE),
        sampling: z.number().min(0).max(1).default(1),
        delay: z.number().min(0).default(0),
        // Action fields
        actionType: z.nativeEnum(ActionType),
        actionName: z.string().min(1),
        actionConfig: ActionConfigSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user has create/update/delete access to automations
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:CUD",
      });

      const triggerId = v4();
      const actionId = v4();

      const [trigger, action] = await ctx.prisma.$transaction(async (tx) => {
        const trigger = await tx.trigger.create({
          data: {
            id: triggerId,
            projectId: ctx.session.projectId,
            description: input.description,
            eventSource: input.eventSource,
            filter: input.filter ? input.filter : [],

            status: input.status,
            sampling: input.sampling,
            delay: input.delay,
          },
        });

        // First create the action
        const action = await tx.action.create({
          data: {
            id: actionId,
            projectId: ctx.session.projectId,
            name: input.actionName,
            description: input.description,
            type: input.actionType,
            config: input.actionConfig,
            triggers: {
              create: [
                {
                  projectId: ctx.session.projectId,
                  triggerId: triggerId,
                },
              ],
            },
          },
        });

        return [trigger, action];
      });

      // Then create the trigger with the action ID

      return { action, trigger };
    }),

  // Update an existing automation
  updateAutomation: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        triggerId: z.string(),
        actionId: z.string(),
        description: z.string().optional(),
        eventSource: z.string(),
        filter: z.array(z.any()).nullable(),
        status: z.nativeEnum(JobConfigState),
        sampling: z.number().min(0).max(1),
        delay: z.number().min(0),
        // Action fields
        actionType: z.nativeEnum(ActionType),
        actionConfig: ActionConfigSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user has create/update/delete access to automations
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:CUD",
      });

      // Update the action
      const action = await ctx.prisma.action.update({
        where: {
          id: input.actionId,
          projectId: ctx.session.projectId,
        },
        data: {
          name: input.description,
          description: input.description,
          type: input.actionType,
          config: input.actionConfig,
        },
      });

      // Update the trigger
      const trigger = await ctx.prisma.trigger.update({
        where: {
          id: input.triggerId,
          projectId: ctx.session.projectId,
        },
        data: {
          description: input.description,
          eventSource: input.eventSource,
          filter: input.filter ? JSON.stringify(input.filter) : Prisma.JsonNull,
          status: input.status,
          sampling: input.sampling,
          delay: input.delay,
        },
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
