import { z } from "zod/v4";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
} from "@/src/server/api/trpc";
import { getAccessibleOrganizationProjects } from "@/src/features/v4/server/v4TransitionService";
import { getOrganizationIngestionOverview } from "@/src/features/organization-ingestion/server/organizationIngestionService";

export const organizationIngestionRouter = createTRPCRouter({
  /**
   * Per-project ingestion flows (clients, event and score counts) for the
   * trailing 7 days vs the 7 days before. Scoped to the projects the caller
   * can access within the organization.
   */
  overview: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ input, ctx }) => {
      const projects = await getAccessibleOrganizationProjects({
        prisma: ctx.prisma,
        orgId: input.orgId,
        session: ctx.session,
      });
      return getOrganizationIngestionOverview({ projects });
    }),
});
