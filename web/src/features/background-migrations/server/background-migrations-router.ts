import { z } from "zod";

import { ModelUsageUnit } from "@langfuse/shared";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
  protectedProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { paginationZod } from "@langfuse/shared";
import { TRPCError } from "@trpc/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { isValidPostgresRegex } from "@/src/features/models/server/isValidPostgresRegex";

const ModelAllOptions = z.object({
  projectId: z.string(),
});

export const backgroundMigrationsRouter = createTRPCRouter({
  all: protectedProcedure.query(async ({ ctx }) => {
    const backgroundMigrations = await ctx.prisma.backgroundMigration.findMany({
      orderBy: {
        name: "asc",
      },
    });

    return { migrations: backgroundMigrations };
  }),
});
