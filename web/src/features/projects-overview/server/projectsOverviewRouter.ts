import * as z from "zod";
import {
  getBillingCycleEnd,
  getBillingCycleStart,
  getLastTraceTimestampsByProjects,
} from "@langfuse/shared/src/server";
import { CloudConfigSchema } from "@langfuse/shared";
import { MAX_EVENTS_FREE_PLAN } from "@/src/ee/features/billing/constants";
import { isCloudBillingEnabled } from "@/src/ee/features/billing/server";
import { getOrgUsageBreakdown } from "@/src/features/organization-usage/server";
import { hasOrganizationAccess } from "@/src/features/rbac";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
} from "@/src/server/api/trpc";

const startOfUtcMonth = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
const startOfNextUtcMonth = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));

export const projectsOverviewRouter = createTRPCRouter({
  /**
   * Everything the projects overview shows for one organization in a single
   * round trip: last trace per project (ClickHouse, 30 days), billable units
   * per project for the current billing period (ClickHouse, same metering
   * definition as the usage page), the usage meter and its plan limit
   * (Postgres, the hourly cached meter Cloud billing uses), and the member
   * count. Usage and members are only returned to roles that may read them.
   */
  byOrganization: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ input, ctx }) => {
      const sessionOrganization = ctx.session.user.organizations.find(
        (organization) => organization.id === input.orgId,
      );
      const projectIds =
        sessionOrganization?.projects
          .filter((project) => !project.deletedAt)
          .map((project) => project.id) ?? [];
      const canReadUsage = hasOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organizationUsage:read",
      });
      const canReadMembers = hasOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organizationMembers:read",
      });

      const now = new Date();
      const isCloud = isCloudBillingEnabled();
      const organization = canReadUsage
        ? await ctx.prisma.organization.findUnique({
            where: { id: input.orgId },
          })
        : null;
      const period =
        isCloud && organization
          ? {
              start: getBillingCycleStart(organization, now),
              end: getBillingCycleEnd(organization, now),
              kind: "billing-cycle" as const,
            }
          : {
              start: startOfUtcMonth(now),
              end: startOfNextUtcMonth(now),
              kind: "calendar-month" as const,
            };

      const [lastTraces, breakdown, memberCount] = await Promise.all([
        getLastTraceTimestampsByProjects({ projectIds }),
        organization
          ? getOrgUsageBreakdown({
              prisma: ctx.prisma,
              orgId: input.orgId,
              from: period.start,
              to: now,
            })
          : null,
        canReadMembers
          ? ctx.prisma.organizationMembership.count({
              where: { orgId: input.orgId },
            })
          : null,
      ]);

      const unitsByProjectId = new Map<string, number>();
      for (const row of breakdown?.rows ?? []) {
        unitsByProjectId.set(
          row.projectId,
          (unitsByProjectId.get(row.projectId) ?? 0) + row.count,
        );
      }
      const lastTraceByProjectId = new Map(
        lastTraces.map((row) => [row.projectId, row.lastTraceAt]),
      );
      const countedUnits = [...unitsByProjectId.values()].reduce(
        (sum, units) => sum + units,
        0,
      );
      const cloudConfig = CloudConfigSchema.safeParse(
        organization?.cloudConfig,
      ).data;
      const isHobbyPlan = sessionOrganization?.plan === "cloud:hobby";

      return {
        projects: projectIds.map((projectId) => ({
          projectId,
          lastTraceAt: lastTraceByProjectId.get(projectId) ?? null,
          periodUnits: organization
            ? (unitsByProjectId.get(projectId) ?? 0)
            : null,
        })),
        usage: organization
          ? {
              periodStart: period.start,
              periodEnd: period.end,
              periodKind: period.kind,
              // Cloud meters from the cached cycle usage, like the billing
              // page; elsewhere the counted units are the meter.
              units:
                isCloud && organization.cloudCurrentCycleUsage !== null
                  ? organization.cloudCurrentCycleUsage
                  : countedUnits,
              limit: isHobbyPlan
                ? (cloudConfig?.monthlyObservationLimit ?? MAX_EVENTS_FREE_PLAN)
                : null,
              isIngestionBlocked:
                organization.cloudFreeTierUsageThresholdState === "BLOCKED",
            }
          : null,
        memberCount,
      };
    }),
});
