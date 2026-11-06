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
import { getUserProjectRoles } from "@langfuse/shared/src/server";

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
        const view = await ctx.prisma.$transaction(async (tx) => {
          const lastPin = await tx.sessionViewCustomPin.aggregate({
            where: { projectId: input.projectId, userId: ctx.session.user.id },
            _max: { position: true },
          });
          const preference = await tx.sessionViewPreference.findUnique({
            where: {
              projectId_userId: {
                projectId: input.projectId,
                userId: ctx.session.user.id,
              },
            },
          });
          const lastPosition = Math.max(
            lastPin._max.position ?? -1,
            preference?.messagesUnpinned
              ? -1
              : (preference?.messagesPosition ?? -1),
          );
          return tx.sessionView.create({
            data: {
              ...input,
              createdBy: ctx.session.user.id,
              pins: {
                create: {
                  preference: {
                    connectOrCreate: {
                      where: {
                        projectId_userId: {
                          projectId: input.projectId,
                          userId: ctx.session.user.id,
                        },
                      },
                      create: {
                        projectId: input.projectId,
                        userId: ctx.session.user.id,
                      },
                    },
                  },
                  position: lastPosition + 1,
                },
              },
            },
          });
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
      const preference = await ctx.prisma.sessionViewPreference.findUnique({
        where: {
          projectId_userId: {
            projectId: input.projectId,
            userId: ctx.session.user.id,
          },
        },
        include: { customPins: true },
      });
      const pins = (preference?.customPins ?? []).map(
        ({ viewId, position }) => ({ viewId, position }),
      );
      if (!preference?.messagesUnpinned) {
        pins.push({
          viewId: "messages",
          position: preference?.messagesPosition ?? -1,
        });
      }
      pins.sort(
        (a, b) => a.position - b.position || a.viewId.localeCompare(b.viewId),
      );
      return {
        pinnedViewIds: pins.map((pin) => pin.viewId),
      };
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
      const { projectId, pinnedViewIds } = input;
      const userId = ctx.session.user.id;
      await ctx.prisma.$transaction(async (tx) => {
        if (pinnedViewIds) {
          const views = await tx.sessionView.findMany({
            where: { projectId, id: { in: pinnedViewIds } },
            select: { id: true },
          });
          const validIds = [...new Set(pinnedViewIds)].filter((id) =>
            views.some((view) => view.id === id),
          );
          const messagesPosition = pinnedViewIds.indexOf("messages");
          await tx.sessionViewPreference.upsert({
            where: { projectId_userId: { projectId, userId } },
            create: {
              projectId,
              userId,
              messagesUnpinned: messagesPosition === -1,
              messagesPosition,
            },
            update: {
              messagesUnpinned: messagesPosition === -1,
              messagesPosition,
            },
          });
          await tx.sessionViewCustomPin.deleteMany({
            where: { projectId, userId },
          });
          await tx.sessionViewCustomPin.createMany({
            data: validIds.map((viewId) => ({
              projectId,
              userId,
              viewId,
              position: pinnedViewIds.indexOf(viewId),
            })),
            skipDuplicates: true,
          });
        }
      });
    }),
  pinForEveryone: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "projectMembers:CUD",
      });
      const view = await ctx.prisma.sessionView.findUnique({ where: input });
      if (!view)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session view not found.",
        });
      if (!SessionViewInputSchema.shape.filters.safeParse(view.filters).success)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Unsupported session view.",
        });
      const project = await ctx.prisma.project.findUniqueOrThrow({
        where: { id: input.projectId },
        select: { orgId: true },
      });
      const members = await getUserProjectRoles({
        projectId: input.projectId,
        orgId: project.orgId,
        filterCondition: [],
        searchFilter: Prisma.empty,
        orderBy: Prisma.empty,
      });
      await ctx.prisma.$transaction(async (tx) => {
        const pins = await tx.sessionViewCustomPin.groupBy({
          by: ["userId"],
          where: { projectId: input.projectId },
          _max: { position: true },
        });
        const positions = new Map(
          pins.map((pin) => [pin.userId, pin._max.position ?? -1]),
        );
        await tx.sessionViewPreference.createMany({
          data: members.map(({ id: userId }) => ({
            projectId: input.projectId,
            userId,
          })),
          skipDuplicates: true,
        });
        const preferences = await tx.sessionViewPreference.findMany({
          where: {
            projectId: input.projectId,
            userId: { in: members.map(({ id }) => id) },
          },
        });
        for (const preference of preferences) {
          if (!preference.messagesUnpinned) {
            positions.set(
              preference.userId,
              Math.max(
                positions.get(preference.userId) ?? -1,
                preference.messagesPosition,
              ),
            );
          }
        }
        await tx.sessionViewCustomPin.createMany({
          data: members.map(({ id: userId }) => ({
            projectId: input.projectId,
            userId,
            viewId: input.id,
            position: (positions.get(userId) ?? -1) + 1,
          })),
          skipDuplicates: true,
        });
      });
    }),
});
