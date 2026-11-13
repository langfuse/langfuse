import { randomUUID } from "node:crypto";
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
import { lockSessionViewPins } from "./fns/lockSessionViewPins";

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
      return views.map((view) => ({
        ...view,
        canEdit: canManageSessionView({
          session: ctx.session,
          projectId: input.projectId,
          createdBy: view.createdBy,
        }),
        filters: SessionViewInputSchema.shape.filters.parse(view.filters),
        createdByUser: view.createdByUser
          ? {
              ...view.createdByUser,
              email: canReadMembers ? view.createdByUser.email : null,
            }
          : null,
      }));
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
        const userId = ctx.session.user.id;
        const view = await ctx.prisma.$transaction(async (tx) => {
          await lockSessionViewPins(tx, input.projectId, userId);
          const lastPin = await tx.sessionViewPinOverride.aggregate({
            where: {
              projectId: input.projectId,
              userId,
              OR: [{ viewId: { not: null } }, { isPinned: true }],
            },
            _max: { position: true },
          });
          const view = await tx.sessionView.create({
            data: {
              ...input,
              createdBy: userId,
            },
          });
          await tx.sessionViewPinOverride.create({
            data: {
              projectId: input.projectId,
              userId,
              viewId: view.id,
              position: Math.max(-1, lastPin._max.position ?? -1) + 1,
            },
          });
          return view;
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
            "Only the creator or a project administrator can edit this view.",
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
            "Only the creator or a project administrator can delete this view.",
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
      const overrides = await ctx.prisma.sessionViewPinOverride.findMany({
        where: { projectId: input.projectId, userId: ctx.session.user.id },
        select: { viewId: true, isPinned: true, position: true },
      });
      const defaults = await ctx.prisma.sessionView.findMany({
        where: {
          projectId: input.projectId,
          isPinnedByDefaultForProject: true,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      const pins = overrides
        .filter((pin) => pin.isPinned)
        .map(({ viewId, position }) => ({
          viewId: viewId ?? "messages",
          position,
        }));
      if (!overrides.some((pin) => pin.viewId === null)) {
        pins.push({ viewId: "messages", position: -1 });
      }
      const lastPosition = Math.max(-1, ...pins.map((pin) => pin.position));
      defaults
        .filter((view) => !overrides.some((pin) => pin.viewId === view.id))
        .forEach((view, index) =>
          pins.push({ viewId: view.id, position: lastPosition + index + 1 }),
        );
      pins.sort(
        (a, b) => a.position - b.position || a.viewId.localeCompare(b.viewId),
      );
      return {
        pinnedViewIds: pins.map((pin) => pin.viewId),
      };
    }),
  setPreferences: protectedProjectProcedure
    .input(
      SessionViewPreferencesSchema.extend({
        projectId: z.string(),
        unpinnedViewIds: z.array(z.string()).max(1000).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "TableViewPresets:read",
      });
      const { projectId, pinnedViewIds, unpinnedViewIds } = input;
      const userId = ctx.session.user.id;
      await ctx.prisma.$transaction(async (tx) => {
        await lockSessionViewPins(tx, projectId, userId);
        const candidates = await tx.sessionView.findMany({
          where: {
            projectId,
            id: { in: [...pinnedViewIds, ...unpinnedViewIds] },
          },
          select: { id: true },
        });
        // Lock surviving views before writing their references. A concurrent
        // deletion then behaves like any other stale ID in the request.
        const views = candidates.length
          ? await tx.$queryRaw<{ id: string }[]>`
              SELECT id FROM session_views
              WHERE project_id = ${projectId}
                AND id IN (${Prisma.join(candidates.map(({ id }) => id))})
              ORDER BY id
              FOR KEY SHARE
            `
          : [];
        const messagesPosition = pinnedViewIds.indexOf("messages");
        if (messagesPosition !== -1 || unpinnedViewIds.includes("messages")) {
          await tx.sessionViewPinOverride.updateMany({
            where: { projectId, userId, viewId: null },
            data: {
              isPinned: messagesPosition !== -1,
              position: messagesPosition,
            },
          });
        }
        if (views.length > 0) {
          // Keep existing rows so concurrent view deletion cannot deadlock with
          // deleting and recreating their foreign-key references.
          await tx.$executeRaw`
            INSERT INTO session_view_pin_overrides
              (id, project_id, user_id, view_id, is_pinned, position)
            VALUES ${Prisma.join(
              views.map(
                ({ id }) => Prisma.sql`
              (${randomUUID()}, ${projectId}, ${userId}, ${id},
               ${pinnedViewIds.includes(id)}, ${pinnedViewIds.indexOf(id)})
            `,
              ),
            )}
            ON CONFLICT (project_id, user_id, view_id)
            DO UPDATE SET is_pinned = EXCLUDED.is_pinned, position = EXCLUDED.position
          `;
        }
      });
    }),
  setDefaultPin: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        id: z.string(),
        isPinnedByDefaultForProject: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "projectMembers:CUD",
      });
      const { isPinnedByDefaultForProject, ...where } = input;
      const view = await ctx.prisma.sessionView.findUnique({ where });
      if (!view)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session view not found.",
        });
      await ctx.prisma.sessionView.update({
        where,
        data: { isPinnedByDefaultForProject },
      });
    }),
});
