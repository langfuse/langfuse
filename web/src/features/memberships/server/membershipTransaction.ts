import { prisma, Prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";

const pendingEffects = new WeakMap<Prisma.TransactionClient, Effect[]>();

/** inMembershipTransaction runs fn in a transaction that membership writes can join, then their queued side effects after commit, logging their failures. */
export async function inMembershipTransaction<T>(
  fn: (tx: MembershipTransaction) => Promise<T>,
): Promise<T> {
  const effects: Effect[] = [];
  const result = await prisma.$transaction(async (tx) => {
    pendingEffects.set(tx, effects);
    return fn(tx as MembershipTransaction);
  });
  await runAfterCommit(effects);
  return result;
}

/** lockOrganizations takes each org's membership advisory lock until the transaction ends. */
export async function lockOrganizations(
  tx: Prisma.TransactionClient,
  orgIds: string[],
): Promise<void> {
  // sorted, so multi-org flows cannot deadlock
  for (const orgId of [...new Set(orgIds)].sort()) {
    await tx.$queryRaw(
      Prisma.sql`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`org-membership:${orgId}`}))`,
    );
  }
}

/** afterCommit queues a side effect to run once the membership transaction commits. */
export function afterCommit(tx: MembershipTransaction, effect: Effect) {
  const effects = pendingEffects.get(tx);
  if (!effects) {
    throw new Error("Membership writes must run in inMembershipTransaction");
  }
  effects.push(effect);
}

async function runAfterCommit(effects: Effect[]) {
  for (const effect of effects) {
    try {
      await effect();
    } catch (error) {
      logger.error("Membership side effect failed after commit", error);
    }
  }
}

/** MembershipTransaction is a transaction from inMembershipTransaction, which runs the writes' side effects after commit. */
export type MembershipTransaction = Prisma.TransactionClient & {
  readonly [membershipTransaction]: true;
};

declare const membershipTransaction: unique symbol;

/** Effect is a side effect that runs once the transaction commits. */
type Effect = () => Promise<unknown>;
