import { CloudConfigSchema } from "@langfuse/shared";
import { Role, type PrismaClient } from "@langfuse/shared/src/db";
import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server/getPlan";
import { type Session } from "next-auth";
import { TRPCError } from "@trpc/server";

/**
 * The organization shape attached to the next-auth session. Kept in sync with
 * the module augmentation in web/types/next-auth.d.ts via this derivation, so
 * the admin fallback returns exactly what useOrganization/useProject consumers
 * already expect.
 */
type SessionOrganization = NonNullable<
  Session["user"]
>["organizations"][number];

/**
 * Builds the same organization shape that the next-auth session callback puts
 * on `session.user.organizations[number]`, for a single organization fetched
 * directly from the database.
 *
 * This exists so Langfuse admins — who are not members of customer orgs and
 * therefore have no entry in their session — can still resolve an org/project
 * for client hooks (useOrganization/useProject) when viewing customer settings.
 *
 * SECURITY: takes the caller's request context and enforces admin access
 * itself (throws FORBIDDEN otherwise), and reads the org from the
 * server-resolved ctx.session.orgId — never a raw client-supplied id. Admins
 * are represented as Role.OWNER, mirroring the tRPC middleware elevation.
 * Callers must still run it behind protectedOrganizationProcedure /
 * protectedProjectProcedure so membership resolution and admin-access
 * auditing happen first.
 */
export async function buildAdminOrgContext(ctx: {
  prisma: PrismaClient;
  session: {
    user: { admin?: boolean } | null;
    orgId: string;
  };
}): Promise<SessionOrganization | null> {
  if (ctx.session.user?.admin !== true) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only Langfuse admins can access this endpoint",
    });
  }

  const organization = await ctx.prisma.organization.findUnique({
    where: { id: ctx.session.orgId },
    include: {
      projects: {
        where: { deletedAt: null },
        // Newest first, matching the session callback's project ordering
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!organization) return null;

  const parsedCloudConfig = CloudConfigSchema.safeParse(
    organization.cloudConfig,
  );

  return {
    id: organization.id,
    name: organization.name,
    role: Role.OWNER,
    metadata: (organization.metadata as Record<string, unknown>) ?? {},
    aiFeaturesEnabled: organization.aiFeaturesEnabled,
    aiTelemetryEnabled: organization.aiTelemetryEnabled,
    cloudConfig: parsedCloudConfig.data,
    projects: organization.projects.map((project) => ({
      id: project.id,
      name: project.name,
      role: Role.OWNER,
      retentionDays: project.retentionDays,
      hasTraces: project.hasTraces,
      deletedAt: project.deletedAt,
      metadata: (project.metadata as Record<string, unknown>) ?? {},
      createdAt: project.createdAt.toISOString(),
    })),
    plan: getOrganizationPlanServerSide(parsedCloudConfig.data),
  };
}
