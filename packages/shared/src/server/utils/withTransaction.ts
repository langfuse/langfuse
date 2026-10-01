import { type Prisma, type PrismaClient } from "@prisma/client";

/** Runs in the supplied transaction or opens one for a root client. */
export async function withTransaction<T>(
  client: PrismaClient | Prisma.TransactionClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return "$transaction" in client ? client.$transaction(fn) : fn(client);
}
