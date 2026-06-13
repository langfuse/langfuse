import * as z from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { TRPCError } from "@trpc/server";

export const SEARCH_BAR_PROJECT_METADATA_KEY = "searchBarEnabled";

export const searchBarRouter = createTRPCRouter({
  setEnabled: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "project:update",
      });

      const project = await ctx.prisma.project.findFirst({
        where: {
          id: input.projectId,
          orgId: ctx.session.orgId,
          deletedAt: null,
        },
      });
      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      const metadata = {
        ...((project.metadata as Record<string, unknown> | null) ?? {}),
        [SEARCH_BAR_PROJECT_METADATA_KEY]: input.enabled,
      };

      const updated = await ctx.prisma.project.update({
        where: { id: input.projectId, orgId: ctx.session.orgId },
        data: { metadata },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "project",
        resourceId: input.projectId,
        action: "update",
        before: project,
        after: updated,
      });

      return { searchBarEnabled: input.enabled };
    }),
});
