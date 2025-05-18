import { createTRPCRouter } from "@/src/server/api/trpc";
import { protectedProjectProcedure } from "@/src/server/api/trpc";
import { z } from "zod";
import { ActionType, JobConfigState } from "@langfuse/shared";
import { Prisma } from "@prisma/client";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

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

      const automations = await ctx.prisma.trigger.findMany({
        where: { projectId: ctx.session.projectId },
        include: {
          actions: true,
        },
      });

      return automations;
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
        actionConfig: z.record(z.any()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user has create/update/delete access to automations
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:CUD",
      });

      // First create the action
      const action = await ctx.prisma.action.create({
        data: {
          projectId: ctx.session.projectId,
          name: input.actionName,
          description: input.description,
          type: input.actionType,
          config: input.actionConfig,
        },
      });

      // Then create the trigger with the action ID
      const trigger = await ctx.prisma.trigger.create({
        data: {
          projectId: ctx.session.projectId,
          description: input.description,
          eventSource: input.eventSource,
          filter: input.filter ? JSON.stringify(input.filter) : Prisma.JsonNull,
          actionId: action.id,
          status: input.status,
          sampling: input.sampling,
          delay: input.delay,
        },
        include: {
          action: true,
        },
      });

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
        actionConfig: z.record(z.any()),
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
        include: {
          action: true,
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user has create/update/delete access to automations
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:CUD",
      });

      // First find the trigger to get the actionId
      const trigger = await ctx.prisma.trigger.findUnique({
        where: {
          id: input.triggerId,
          projectId: ctx.session.projectId,
        },
        select: { actionId: true },
      });

      if (!trigger) {
        throw new Error("Trigger not found");
      }

      // Delete the trigger
      await ctx.prisma.trigger.delete({
        where: {
          id: input.triggerId,
          projectId: ctx.session.projectId,
        },
      });

      // Delete the associated action
      await ctx.prisma.action.delete({
        where: {
          id: trigger.actionId,
          projectId: ctx.session.projectId,
        },
      });

      return { success: true };
    }),

  // Keep the individual routes for backward compatibility
  createAction: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1),
        description: z.string().optional(),
        type: z.nativeEnum(ActionType),
        config: z.record(z.any()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user has create/update/delete access to automations
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:CUD",
      });

      return await ctx.prisma.action.create({
        data: {
          projectId: ctx.session.projectId,
          name: input.name,
          description: input.description,
          type: input.type,
          config: input.config,
        },
      });
    }),

  createTrigger: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        description: z.string().optional(),
        eventSource: z.string(),
        filter: z.record(z.any()).nullable(),
        actionId: z.string(),
        status: z.nativeEnum(JobConfigState).default(JobConfigState.ACTIVE),
        sampling: z.number().min(0).max(1).default(1),
        delay: z.number().min(0).default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user has create/update/delete access to automations
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:CUD",
      });

      return await ctx.prisma.trigger.create({
        data: {
          projectId: ctx.session.projectId,
          description: input.description,
          eventSource: input.eventSource,
          filter: input.filter ? JSON.stringify(input.filter) : Prisma.JsonNull,
          actionId: input.actionId,
          status: input.status,
          sampling: input.sampling,
          delay: input.delay,
        },
      });
    }),
});
