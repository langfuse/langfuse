import { type Prisma, type PrismaClient } from "@prisma/client";

/** withTransaction joins an existing transaction or opens one. */
export async function withTransaction<T>(
  client: PrismaClient | Prisma.TransactionClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return "$transaction" in client ? client.$transaction(fn) : fn(client);
}
