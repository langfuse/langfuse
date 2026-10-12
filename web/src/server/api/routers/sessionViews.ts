import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma, sessionTraceFilterSchema } from "@langfuse/shared";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac";

const viewInput = z.object({
  projectId: z.string(),
  name: z.string().trim().min(1).max(100),
  filters: sessionTraceFilterSchema,
});

export const sessionViewsRouter = createTRPCRouter({
  list: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "TableViewPresets:read",
      });
      const views = await ctx.prisma.sessionView.findMany({
        where: { projectId: input.projectId },
        orderBy: { name: "asc" },
      });
      return views.map((view) => ({
        ...view,
        filters: sessionTraceFilterSchema.parse(view.filters),
      }));
    }),
  save: protectedProjectProcedure
    .input(viewInput.extend({ id: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "TableViewPresets:CUD",
      });
      const data = {
        name: input.name,
        filters: input.filters,
      };
      try {
        if (input.id) {
          const result = await ctx.prisma.sessionView.updateMany({
            where: { id: input.id, projectId: input.projectId },
            data,
          });
          if (result.count === 0)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Session view not found",
            });
          return { id: input.id };
        }
        return await ctx.prisma.sessionView.create({
          data: { ...data, projectId: input.projectId },
          select: { id: true },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A session view with this name already exists.",
          });
        }
        throw error;
      }
    }),
  delete: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "TableViewPresets:CUD",
      });
      await ctx.prisma.sessionView.deleteMany({ where: input });
    }),
});
