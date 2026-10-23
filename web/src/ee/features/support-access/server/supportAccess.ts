import { z } from "zod/v4";

import { prisma, Role } from "@langfuse/shared/src/db";

// Shape of users.support_access. Each key is an organization id the user may
// view as a Langfuse support engineer until expiresAt. Only the ConductorOne
// webhook writes this column.
const SupportAccessEntrySchema = z.object({
  role: z.literal("VIEWER"),
  expiresAt: z.iso.datetime(),
  c1TaskId: z.string(),
});

export const SupportAccessSchema = z.record(
  z.string(),
  SupportAccessEntrySchema,
);

export type SupportAccess = z.infer<typeof SupportAccessSchema>;
export type SupportAccessEntry = z.infer<typeof SupportAccessEntrySchema>;

/**
 * Returns the org ids with unexpired support access. Expiry is checked here, on
 * every session read, so access lapses even if ConductorOne never sends the
 * revoke. Malformed values grant nothing.
 */
export function getActiveSupportAccessOrgIds(
  supportAccess: unknown,
  now: Date = new Date(),
): string[] {
  if (supportAccess === null || supportAccess === undefined) return [];
  const parsed = SupportAccessSchema.safeParse(supportAccess);
  if (!parsed.success) return [];

  return Object.entries(parsed.data)
    .filter(([, entry]) => new Date(entry.expiresAt) > now)
    .map(([orgId]) => orgId);
}

/**
 * Org memberships to add to the session for unexpired support access grants:
 * VIEWER on every project. Orgs the user is a real member of are skipped, so
 * their own role wins.
 */
export async function getSupportAccessMemberships(
  user: {
    supportAccess: unknown;
    organizationMemberships: { organization: { id: string } }[];
  } | null,
) {
  if (!user) return [];
  const memberOrgIds = new Set(
    user.organizationMemberships.map((m) => m.organization.id),
  );
  const orgIds = getActiveSupportAccessOrgIds(user.supportAccess).filter(
    (orgId) => !memberOrgIds.has(orgId),
  );
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
