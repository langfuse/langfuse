import { prisma, Role } from "@langfuse/shared/src/db";

import { type SfdcLeadSource } from "./sfdcService";

/**
 * Lead source for a user whose Lead is sent after the fact (backfill, member
 * re-link) rather than at signup. Derived from the user's GLOBAL membership
 * history so every caller sends the same value regardless of which org
 * triggered the send: earliest non-NONE membership created with role OWNER →
 * "Langfuse Cloud Signup", any other role → "Langfuse Cloud Invite"; no such
 * membership → Signup. Accepted invitations are deleted on accept, so this
 * is a heuristic, not a record.
 *
 * `excludeOrgIds` must contain the demo org: every Cloud signup holds a
 * VIEWER membership there, which would otherwise flip every organic signup
 * to "Invite".
 */
export async function deriveLeadSourceFromMemberships(
  userId: string,
  excludeOrgIds: string[],
): Promise<SfdcLeadSource> {
  const firstMembership = await prisma.organizationMembership.findFirst({
    where: {
      userId,
      role: { not: Role.NONE },
      ...(excludeOrgIds.length ? { orgId: { notIn: excludeOrgIds } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { role: true },
  });
  if (firstMembership)
    return firstMembership.role === Role.OWNER
      ? "Langfuse Cloud Signup"
      : "Langfuse Cloud Invite";
  return "Langfuse Cloud Signup";
}
