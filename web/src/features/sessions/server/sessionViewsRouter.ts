import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { type Session } from "next-auth";
import {
  Prisma,
  InvalidRequestError,
  LangfuseConflictError,
  ForbiddenError,
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

function sessionViewVisibilityWhere(
  session: Session,
  projectId: string,
): Prisma.SessionViewWhereInput {
  if (!session.user) return { projectId, OR: [] };
  const OR: Prisma.SessionViewWhereInput[] = [];
  if (hasProjectAccess({ session, projectId, scope: "SessionViews:read" })) {
    OR.push({ ownership: "PROJECT" });
  }
  if (
    hasProjectAccess({ session, projectId, scope: "TableViewPresets:read" })
  ) {
    OR.push({ ownership: "PRIVATE", createdBy: session.user.id });
  }
  return { projectId, OR };
}

export const sessionViewsRouter = createTRPCRouter({
  list: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const views = await ctx.prisma.sessionView.findMany({
        where: sessionViewVisibilityWhere(ctx.session, input.projectId),
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
          ownership: view.ownership,
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
        scope:
          input.ownership === "PROJECT"
            ? "SessionViews:CUD"
            : "TableViewPresets:CUD",
      });
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
    }),
  update: protectedProjectProcedure
    .input(
      SessionViewInputSchema.extend({
        id: z.string(),
        ownership: SessionViewInputSchema.shape.ownership.unwrap().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, projectId, ownership, ...data } = input;
      const existing = await ctx.prisma.sessionView.findFirst({
        where: { ...sessionViewVisibilityWhere(ctx.session, projectId), id },
      });
      if (!existing)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session view not found.",
        });
      if (ownership === "PRIVATE" && existing.ownership === "PROJECT") {
        throw new InvalidRequestError("Project views cannot be made private.");
      }
      if (
        !canManageSessionView({
          session: ctx.session,
          projectId,
          createdBy: existing.createdBy,
          ownership: existing.ownership,
        })
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to edit this view.",
        });
      }
      if (ownership === "PROJECT" && existing.ownership === "PRIVATE") {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId,
          scope: "SessionViews:CUD",
        });
      }
      try {
        const view = await ctx.prisma.sessionView.update({
          where: {
            id,
            projectId,
            createdBy: existing.createdBy,
            ownership: existing.ownership,
          },
          data: { ...data, ownership },
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
        }
        throw error;
      }
    }),
  delete: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const view = await ctx.prisma.sessionView.findFirst({
        where: {
          ...sessionViewVisibilityWhere(ctx.session, input.projectId),
          id: input.id,
        },
      });
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
          ownership: view.ownership,
        })
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to delete this view.",
        });
      }
      const result = await ctx.prisma.$transaction(async (tx) => {
        // Queue inserts acquire a foreign-key key-share lock on this row.
        await tx.$queryRaw`
          SELECT id FROM session_views
          WHERE project_id = ${input.projectId} AND id = ${input.id}
          FOR UPDATE
        `;
        const queues = await tx.annotationQueue.findMany({
          where: { projectId: input.projectId, sessionViewId: input.id },
          select: { name: true },
          orderBy: { name: "asc" },
        });
        if (queues.length > 0) {
          throw new LangfuseConflictError(
            `This session view is used by annotation queues: ${queues.map(({ name }) => name).join(", ")}. Choose another view for these queues before deleting it.`,
          );
        }
        return tx.sessionView.deleteMany({
          where: { ...input, createdBy: view.createdBy },
        });
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
      const overrides = await ctx.prisma.sessionViewPinOverride.findMany({
        where: {
          projectId: input.projectId,
          userId: ctx.session.user.id,
          OR: [
            { viewId: null },
            { view: sessionViewVisibilityWhere(ctx.session, input.projectId) },
          ],
        },
        select: { viewId: true, isPinned: true, position: true },
      });
      const defaults = await ctx.prisma.sessionView.findMany({
        where: {
          projectId: input.projectId,
          ...sessionViewVisibilityWhere(ctx.session, input.projectId),
          ownership: "PROJECT",
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
      const { projectId, pinnedViewIds, unpinnedViewIds } = input;
      const userId = ctx.session.user.id;
      await ctx.prisma.$transaction(async (tx) => {
        await lockSessionViewPins(tx, projectId, userId);
        const candidates = await tx.sessionView.findMany({
          where: {
            ...sessionViewVisibilityWhere(ctx.session, projectId),
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
        promoteToProject: z.literal(true).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "SessionViews:CUD",
      });
      const { isPinnedByDefaultForProject, promoteToProject, ...where } = input;
      const view = await ctx.prisma.sessionView.findFirst({
        where: {
          ...sessionViewVisibilityWhere(ctx.session, input.projectId),
          ...where,
        },
      });
      if (!view)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session view not found.",
        });
      if (view.ownership === "PRIVATE") {
        if (!promoteToProject || !isPinnedByDefaultForProject) {
          throw new InvalidRequestError(
            "Convert this private view to a project view before pinning it by default.",
          );
        }
        if (
          !canManageSessionView({
            session: ctx.session,
            projectId: input.projectId,
            createdBy: view.createdBy,
            ownership: view.ownership,
          })
        ) {
          throw new ForbiddenError(
            "You do not have permission to edit this view.",
          );
        }
      }
      await ctx.prisma.sessionView.update({
        where: { ...where, ownership: view.ownership },
        data: {
          isPinnedByDefaultForProject,
          ...(promoteToProject ? { ownership: "PROJECT" as const } : {}),
        },
      });
    }),
});
