import { z } from "zod/v4";
import { createTRPCRouter, protectedProcedure } from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";

export const backgroundMigrationsRouter = createTRPCRouter({
  all: protectedProcedure.query(async ({ ctx }) => {
    const backgroundMigrations = await ctx.prisma.backgroundMigration.findMany({
      orderBy: {
        name: "asc",
      },
    });

    return { migrations: backgroundMigrations };
  }),
  status: protectedProcedure.query(async ({ ctx }) => {
    const backgroundMigrations = await ctx.prisma.backgroundMigration.findMany({
      orderBy: {
        name: "asc",
      },
    });

    if (backgroundMigrations.some((m) => m.failedAt !== null)) {
      return { status: "FAILED" };
    }

    if (
      backgroundMigrations.some(
        (m) => m.finishedAt === null && m.failedAt === null,
      )
    ) {
      return { status: "ACTIVE" };
    }

    return { status: "FINISHED" };
  }),
  retry: protectedProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const backgroundMigration =
        await ctx.prisma.backgroundMigration.findUnique({
          where: {
            name: input.name,
          },
        });

      if (!backgroundMigration) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Background migration not found",
        });
      }

      await ctx.prisma.backgroundMigration.update({
        where: {
          name: input.name,
        },
        data: {
          state: {},
          failedAt: null,
          failedReason: null,
          finishedAt: null,
        },
      });

      return { backgroundMigration };
    }),
});
