import {
  hasEntitlementLimit,
  throwIfExceedsLimit,
} from "@/src/features/entitlements/server/hasEntitlementLimit";
import { type EntitlementLimit } from "@/src/features/entitlements/constants/entitlements";
import { Prisma, type PrismaClient } from "@langfuse/shared/src/db";
import { type Session } from "next-auth";

/**
 * Serializes the rest of the transaction against every other holder of this
 * lock. Concurrent inserts of rows that reference the organization take
 * FOR KEY SHARE on the same row via their foreign key, so they queue behind
 * this lock too — keep the locked section to local database work only (no
 * email, no outbound HTTP).
 */
async function lockOrganization({
  tx,
  orgId,
}: {
  tx: Prisma.TransactionClient;
  orgId: string;
}) {
  await tx.$queryRaw(
    Prisma.sql`
      SELECT id
      FROM organizations
      WHERE id = ${orgId}
      FOR UPDATE
    `,
  );
}

/**
 * Creates a resource only if doing so keeps the organization within a numeric
 * entitlement limit.
 *
 * Counting and creating in separate auto-committed statements is a
 * time-of-check-to-time-of-use race: concurrent requests all read the same
 * pre-insert count, all pass the check, and all insert — so a plan limit of N
 * admits more than N rows. Serializing on the organization row means a
 * request's count already includes every insert that committed before it, on
 * a single instance and across instances alike.
 *
 * Orgs whose plan does not limit this entitlement skip the lock entirely, so
 * unlimited plans keep creating resources concurrently.
 */
export async function createWithinEntitlementLimit<T>({
  prisma,
  orgId,
  entitlementLimit,
  sessionUser,
  countCurrentUsage,
  create,
}: {
  prisma: PrismaClient;
  orgId: string;
  entitlementLimit: EntitlementLimit;
  sessionUser: NonNullable<Session["user"]>;
  /** Counts existing usage towards the limit. Must read through `tx`. */
  countCurrentUsage: (tx: Prisma.TransactionClient) => Promise<number>;
  /** Creates the resource. Must write through `tx`. */
  create: (tx: Prisma.TransactionClient) => Promise<T>;
}): Promise<T> {
  const isUnlimited =
    hasEntitlementLimit({ entitlementLimit, sessionUser, orgId }) === false;
  if (isUnlimited) return create(prisma);

  return prisma.$transaction(async (tx) => {
    await lockOrganization({ tx, orgId });

    throwIfExceedsLimit({
      entitlementLimit,
      sessionUser,
      orgId,
      currentUsage: await countCurrentUsage(tx),
    });

    return create(tx);
  });
}
