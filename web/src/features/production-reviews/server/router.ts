import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { collectProductionReview } from "@/src/features/production-reviews/server/collectProductionReview";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";

const MARKDOWN_LIMIT = 100_000;

const reviewSelect = {
  id: true,
  title: true,
  markdown: true,
  createdAt: true,
  windowStart: true,
  windowEnd: true,
} as const;

export const productionReviewsRouter = createTRPCRouter({
  list: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "traces:read",
      });

      return ctx.prisma.productionReview.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          title: true,
          createdAt: true,
          windowStart: true,
          windowEnd: true,
        },
      });
    }),

  byId: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), id: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "traces:read",
      });

      const review = await ctx.prisma.productionReview.findFirst({
        where: { id: input.id, projectId: input.projectId },
        select: reviewSelect,
      });
      if (!review) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Report not found",
        });
      }
      return review;
    }),

  create: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "traces:read",
      });

      const review = await collectProductionReview(input.projectId);
      const markdown =
        review.markdown.length > MARKDOWN_LIMIT
          ? `${review.markdown.slice(0, MARKDOWN_LIMIT)}\n\nThe report was shortened.`
          : review.markdown;

      return ctx.prisma.productionReview.create({
        data: {
          projectId: input.projectId,
          title: "Last 24 hours",
          markdown,
          windowStart: review.windowStart,
          windowEnd: review.windowEnd,
        },
        select: reviewSelect,
      });
    }),
});
