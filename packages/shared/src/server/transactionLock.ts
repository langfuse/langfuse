import { type Prisma } from "../db";
import { env } from "../env";

/**
 * Holds an exclusive lock on `key` until the transaction commits or rolls back.
 * A transaction that locks the same key waits until then.
 *
 * PostgreSQL uses a transaction-scoped advisory lock. CockroachDB has no
 * `hashtextextended` to derive the lock id, so there the lock is a write on
 * the key's row in `transaction_locks`. The upsert writes the row, also while
 * another transaction is still writing it, and waits for that transaction to
 * end. The delete in the same transaction keeps the write lock until commit
 * and leaves no row behind, so the table stays empty between transactions.
 */
export async function lockTransactionKey(
  tx: Prisma.TransactionClient,
  key: string,
): Promise<void> {
  if (env.LANGFUSE_POSTGRES_ENGINE === "cockroachdb") {
    await tx.$executeRaw`
      INSERT INTO transaction_locks ("key") VALUES (${key})
      ON CONFLICT ("key") DO UPDATE SET "key" = EXCLUDED."key"`;
    await tx.$executeRaw`DELETE FROM transaction_locks WHERE "key" = ${key}`;
    return;
  }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
