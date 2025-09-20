import { z } from "zod/v4";
import {
  createTRPCRouter,
  adminProcedure,
  authenticatedProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { env } from "@/src/env.mjs";

const denyOnLangfuseCloud = () => {
  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Background migrations are not available in Langfuse Cloud",
    });
  }
};

export const backgroundMigrationsRouter = createTRPCRouter({
  all: authenticatedProcedure.query(async ({ ctx }) => {
    denyOnLangfuseCloud();
    const backgroundMigrations = await ctx.prisma.backgroundMigration.findMany({
      orderBy: {
        name: "asc",
      },
    });

    return { migrations: backgroundMigrations };
  }),
  status: authenticatedProcedure.query(async ({ ctx }) => {
    denyOnLangfuseCloud();
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
  retry: adminProcedure
    .input(z.object({ name: z.string(), adminApiKey: z.string() }))
    .mutation(async ({ input, ctx }) => {
      denyOnLangfuseCloud();

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
