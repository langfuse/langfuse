import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { env } from "@/src/env.mjs";
import { hasInternalAccess } from "@/src/features/feature-flags/server";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
} from "@/src/server/api/trpc";
import { getAccessibleOrganizationProjects } from "@/src/features/v4/server/v4TransitionService";
import { getOrganizationIngestionOverview } from "@/src/features/organization-ingestion/server/organizationIngestionService";

export const organizationIngestionRouter = createTRPCRouter({
  /**
   * Raw event and score counts per project and ingesting client for the
   * trailing 7 days vs the 7 days before. Scoped to the projects the caller
   * can access within the organization. Internal preview only.
   */
  overview: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ input, ctx }) => {
      if (
        !hasInternalAccess({
          isAdmin: ctx.session.user.admin === true,
          isExperimentalFeaturesEnabled:
            env.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES === "true",
        })
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "The organization ingestion overview is an internal preview.",
        });
      }

      const projects = await getAccessibleOrganizationProjects({
        prisma: ctx.prisma,
        orgId: input.orgId,
        session: ctx.session,
      });
      return getOrganizationIngestionOverview({ projects });
    }),
});
