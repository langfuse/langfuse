import { z } from "zod/v4";

import { Prisma, prisma } from "@langfuse/shared/src/db";
import { OrganizationId, SystemRoleId, UserId } from "@langfuse/shared/rbac";
import {
  assignRole,
  revokeExpiringRolesForPrincipal,
} from "@langfuse/shared/rbac/server";

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

/** grantSupportAccess records a support grant and mirrors it as an expiring VIEWER assignment. */
export async function grantSupportAccess(
  userId: string,
  orgId: string,
  expiresAt: Date,
) {
  const entry: SupportAccess[string] = {
    role: "VIEWER",
    expiresAt: expiresAt.toISOString(),
  };
  await prisma.$transaction(async (tx) => {
    // Single statement so concurrent grants for different orgs don't collide.
    await tx.$executeRaw`
      UPDATE users
      SET support_access = COALESCE(support_access, '{}'::jsonb)
        || jsonb_build_object(${orgId}::text, ${JSON.stringify(entry)}::jsonb)
      WHERE id = ${userId}`;
    await revokeExpiringRolesForPrincipal(tx, {
      principalId: UserId(userId),
      ownerId: OrganizationId(orgId),
    });
    await assignRole(tx, {
      tenantId: OrganizationId(orgId),
      ownerId: OrganizationId(orgId),
      principalId: UserId(userId),
      roleId: SystemRoleId("VIEWER"),
      tags: [],
      expiresAt,
    });
  });
}

/** revokeAllSupportAccess clears a user's support grants and their expiring assignments. */
export async function revokeAllSupportAccess(user: {
  id: string;
  supportAccess: SupportAccess;
}): Promise<string[]> {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { supportAccess: Prisma.DbNull },
    });
    await revokeExpiringRolesForPrincipal(tx, {
      principalId: UserId(user.id),
    });
  });
  return Object.keys(user.supportAccess);
}
