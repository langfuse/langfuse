import { CloudConfigSchema } from "@langfuse/shared";
import { Role, type PrismaClient } from "@langfuse/shared/src/db";
import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server/getPlan";
import { type Session } from "next-auth";

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
 * SECURITY: this helper performs no access control. Callers must only invoke it
 * after access has been enforced (e.g. behind protectedOrganizationProcedure /
 * protectedProjectProcedure), and must pass the server-resolved orgId
 * (ctx.session.orgId), never a raw client-supplied id. Admins are represented
 * as Role.OWNER, mirroring how the tRPC middleware elevates them server-side.
 */
export async function buildAdminOrgContext(
  prisma: PrismaClient,
  orgId: string,
): Promise<SessionOrganization | null> {
  const organization = await prisma.organization.findUnique({
    where: { id: orgId },
    include: {
      projects: {
        where: { deletedAt: null },
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
