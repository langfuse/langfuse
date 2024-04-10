import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";

const TaskOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
});

const TaskByIdOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  id: z.string().nullish(),
});

const TaskByNameOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  name: z.string(),
});

export const taskRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(TaskOptions)
    .query(async ({ input, ctx }) => {
      const tasks = await ctx.prisma.task.findMany({
        where: {
          projectId: input.projectId,
        },
        include: {
          botSchema: true,
          inputSchema: true,
          outputSchema: true,
        },
      });

      return tasks;
    }),
  byId: protectedProjectProcedure
    .input(TaskByIdOptions)
    .query(async ({ input, ctx }) => {
      if (!input.id) {
        return null;
      }
      const task = await ctx.prisma.task.findFirstOrThrow({
        where: {
          projectId: input.projectId,
          id: input.id,
        },
        include: {
          botSchema: true,
          inputSchema: true,
          outputSchema: true,
        },
      });

      return task;
    }),
  byName: protectedProjectProcedure
    .input(TaskByNameOptions)
    .query(async ({ input, ctx }) => {
      const task = await ctx.prisma.task.findFirstOrThrow({
        where: {
          projectId: input.projectId,
          name: input.name,
        },
        include: {
          botSchema: true,
          inputSchema: true,
          outputSchema: true,
        },
      });

      return task;
    }),
});
