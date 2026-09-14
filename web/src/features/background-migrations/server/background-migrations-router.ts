import { z } from "zod";
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

const ENV_GATE_PREFIX = "LANGFUSE_BACKGROUND_MIGRATION_";

// Mirrors the worker's gate discovery
// (worker/src/backgroundMigrations/backgroundMigrationManager.ts): a row may
// declare `args.envGate = "<ENV_VAR>"` and stays dormant until the operator
// sets that env var to "true". Only gates sharing the
// LANGFUSE_BACKGROUND_MIGRATION_ prefix are considered, matching the worker.
// A row already claimed by a worker (workerId set) is never dormant — the
// gate only needs to be enabled on the worker for the migration to run.
const isDormant = (migration: {
  args: unknown;
  workerId: string | null;
}): boolean => {
  if (migration.workerId !== null) {
    return false;
  }

  const envGate =
    typeof migration.args === "object" &&
    migration.args !== null &&
    !Array.isArray(migration.args)
      ? (migration.args as Record<string, unknown>).envGate
      : undefined;
  if (typeof envGate !== "string") {
    return false;
  }

  return (
    !envGate.startsWith(ENV_GATE_PREFIX) ||
    (env as unknown as Record<string, unknown>)[envGate] !== "true"
  );
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

    // Dormant rows are excluded: they wait on an env gate the operator has not
    // set, so nothing is running and the sidebar should not show activity.
    if (
      backgroundMigrations.some(
        (m) => m.finishedAt === null && m.failedAt === null && !isDormant(m),
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
