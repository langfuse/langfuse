import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  Prisma,
  SessionViewInputSchema,
  SessionViewPreferencesSchema,
} from "@langfuse/shared";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  hasProjectAccess,
  throwIfNoProjectAccess,
} from "@/src/features/rbac/utils/checkProjectAccess";
import { canManageSessionView } from "../fns/canManageSessionView";

export const sessionViewsRouter = createTRPCRouter({
  list: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "TableViewPresets:read",
      });
      const views = await ctx.prisma.sessionView.findMany({
        where: { projectId: input.projectId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: {
          createdByUser: { select: { name: true, email: true, image: true } },
        },
      });
      const canReadMembers = hasProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "projectMembers:read",
      });
      return views.map((view) => {
        const filters = SessionViewInputSchema.shape.filters.safeParse(
          view.filters,
        );
        return {
          ...view,
          isSupported: filters.success,
          canEdit: canManageSessionView({
            session: ctx.session,
            projectId: input.projectId,
            createdBy: view.createdBy,
          }),
          filters: filters.success ? filters.data : [],
          createdByUser: view.createdByUser
            ? {
                ...view.createdByUser,
                email: canReadMembers ? view.createdByUser.email : null,
              }
            : null,
        };
      });
    }),
  create: protectedProjectProcedure
    .input(SessionViewInputSchema)
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "TableViewPresets:CUD",
      });
      try {
        const view = await ctx.prisma.sessionView.create({
          data: { ...input, createdBy: ctx.session.user.id },
        });
        return {
          view: {
            ...view,
            filters: SessionViewInputSchema.shape.filters.parse(view.filters),
          },
        };
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
  update: protectedProjectProcedure
    .input(SessionViewInputSchema.extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "TableViewPresets:CUD",
      });
      const { id, projectId, ...data } = input;
      const existing = await ctx.prisma.sessionView.findUnique({
        where: { id, projectId },
      });
      if (!existing)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session view not found.",
        });
      if (
        !canManageSessionView({
          session: ctx.session,
          projectId,
          createdBy: existing.createdBy,
        })
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Only the creator or an administrator of an orphaned view can edit this view.",
        });
      }
      try {
        const view = await ctx.prisma.sessionView.update({
          where: { id, projectId, createdBy: existing.createdBy },
          data,
        });
        return {
          view: {
            ...view,
            filters: SessionViewInputSchema.shape.filters.parse(view.filters),
          },
        };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === "P2025")
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Session view no longer exists.",
            });
          if (error.code === "P2002")
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
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "TableViewPresets:CUD",
      });
      const view = await ctx.prisma.sessionView.findUnique({ where: input });
      if (!view)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session view not found.",
        });
      if (
        !canManageSessionView({
          session: ctx.session,
          projectId: input.projectId,
          createdBy: view.createdBy,
        })
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Only the creator or an administrator of an orphaned view can delete this view.",
        });
      }
      const result = await ctx.prisma.sessionView.deleteMany({
        where: { ...input, createdBy: view.createdBy },
      });
      if (result.count === 0)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session view no longer exists.",
        });
    }),
  preferences: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "TableViewPresets:read",
      });
      return (
        (await ctx.prisma.sessionViewPreference.findUnique({
          where: {
            projectId_userId: {
              projectId: input.projectId,
              userId: ctx.session.user.id,
            },
          },
          select: { unpinnedViewIds: true, viewOrder: true },
        })) ?? { unpinnedViewIds: [], viewOrder: [] }
      );
    }),
  setPreferences: protectedProjectProcedure
    .input(
      SessionViewPreferencesSchema.partial().extend({ projectId: z.string() }),
    )
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "TableViewPresets:read",
      });
      const { projectId, ...data } = input;
      const ids = [...(data.unpinnedViewIds ?? []), ...(data.viewOrder ?? [])];
      const views = await ctx.prisma.sessionView.findMany({
        where: { projectId, id: { in: ids } },
        select: { id: true },
      });
      const validIds = new Set(["messages", ...views.map((view) => view.id)]);
      if (data.unpinnedViewIds)
        data.unpinnedViewIds = [
          ...new Set(data.unpinnedViewIds.filter((id) => validIds.has(id))),
        ];
      if (data.viewOrder)
        data.viewOrder = [
          ...new Set(data.viewOrder.filter((id) => validIds.has(id))),
        ];
      return ctx.prisma.sessionViewPreference.upsert({
        where: {
          projectId_userId: { projectId, userId: ctx.session.user.id },
        },
        create: { projectId, userId: ctx.session.user.id, ...data },
        update: data,
        select: { unpinnedViewIds: true, viewOrder: true },
      });
    }),
});
