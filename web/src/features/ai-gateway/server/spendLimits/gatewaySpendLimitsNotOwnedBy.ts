import type { Prisma } from "@langfuse/shared/src/db";

/** Spend limits someone other than `ownerUserId` set, including those whose setter was deleted. */
export function gatewaySpendLimitsNotOwnedBy(
  ownerUserId: string,
): Prisma.GatewaySpendLimitWhereInput {
  return {
    OR: [{ ownerUserId: null }, { ownerUserId: { not: ownerUserId } }],
  };
}
