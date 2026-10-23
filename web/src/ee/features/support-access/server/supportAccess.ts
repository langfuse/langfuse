import { z } from "zod/v4";

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
