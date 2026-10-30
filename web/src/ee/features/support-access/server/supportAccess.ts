import { z } from "zod/v4";

import { Prisma, prisma } from "@langfuse/shared/src/db";

// users.support_access, e.g.
// { "<orgId>": { "role": "VIEWER", "expiresAt": "2026-10-27T04:15:37.316Z" } }
export type SupportAccess = {
  [orgId: string]: {
    role: "VIEWER";
    expiresAt: string;
  };
};

const SupportAccessSchema: z.ZodType<SupportAccess> = z.record(
  z.string(),
  z.object({
    role: z.literal("VIEWER"),
    expiresAt: z.iso.datetime(),
  }),
);

export function parseSupportAccess(value: Prisma.JsonValue): SupportAccess {
  return SupportAccessSchema.safeParse(value ?? {}).data ?? {};
}

export function getActiveSupportAccessGrants(
  supportAccess: SupportAccess,
  now: Date = new Date(),
): { orgId: string; role: SupportAccess[string]["role"] }[] {
  return Object.entries(supportAccess)
    .filter(([, entry]) => new Date(entry.expiresAt) > now)
    .map(([orgId, entry]) => ({ orgId, role: entry.role }));
}

export async function getSupportAccessMemberships(
  user: {
    supportAccess: Prisma.JsonValue;
    organizationMemberships: { organization: { id: string } }[];
  } | null,
) {
  if (!user) return [];
  const memberOrgIds = new Set(
    user.organizationMemberships.map((m) => m.organization.id),
  );
  const roleByOrgId = new Map(
    getActiveSupportAccessGrants(parseSupportAccess(user.supportAccess))
      .filter((grant) => !memberOrgIds.has(grant.orgId))
      .map((grant) => [grant.orgId, grant.role]),
  );
  if (roleByOrgId.size === 0) return [];

  const organizations = await prisma.organization.findMany({
    where: { id: { in: [...roleByOrgId.keys()] } },
    include: {
      projects: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  return organizations.flatMap((organization) => {
    const role = roleByOrgId.get(organization.id);
    if (!role) return [];
    return [
      {
        organization,
        role,
        ProjectMemberships: [],
        supportAccess: true as const,
      },
    ];
  });
}

export async function grantSupportAccess(
  userId: string,
  orgId: string,
  expiresAt: Date,
) {
  const entry: SupportAccess[string] = {
    role: "VIEWER",
    expiresAt: expiresAt.toISOString(),
  };
  // Single statement so concurrent grants for different orgs don't collide.
  await prisma.$executeRaw`
    UPDATE users
    SET support_access = COALESCE(support_access, '{}'::jsonb)
      || jsonb_build_object(${orgId}::text, ${JSON.stringify(entry)}::jsonb)
    WHERE id = ${userId}`;
}

export async function revokeAllSupportAccess(user: {
  id: string;
  supportAccess: SupportAccess;
}): Promise<string[]> {
  await prisma.user.update({
    where: { id: user.id },
    data: { supportAccess: Prisma.DbNull },
  });
  return Object.keys(user.supportAccess);
}
