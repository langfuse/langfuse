import { type Prisma } from "../db";

/**
 * Holds an exclusive lock on `key` until the transaction commits or rolls back.
 * A transaction that locks the same key waits until then.
 */
export async function lockTransactionKey(
  tx: Prisma.TransactionClient,
  key: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
