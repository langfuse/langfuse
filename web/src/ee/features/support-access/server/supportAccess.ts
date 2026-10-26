import { z } from "zod/v4";

import { Prisma, prisma, Role } from "@langfuse/shared/src/db";

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

export function getActiveSupportAccessOrgIds(
  supportAccess: SupportAccess,
  now: Date = new Date(),
): string[] {
  return Object.entries(supportAccess)
    .filter(([, entry]) => new Date(entry.expiresAt) > now)
    .map(([orgId]) => orgId);
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
  const orgIds = getActiveSupportAccessOrgIds(
    parseSupportAccess(user.supportAccess),
  ).filter((orgId) => !memberOrgIds.has(orgId));
  if (orgIds.length === 0) return [];

  const organizations = await prisma.organization.findMany({
    where: { id: { in: orgIds } },
    include: {
      projects: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  return organizations.map((organization) => ({
    organization,
    role: Role.VIEWER,
    ProjectMemberships: [],
  }));
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
