/* eslint-disable @typescript-eslint/no-use-before-define */
import { Prisma, type PrismaClient } from "@prisma/client";

const maxAttempts = 3;

/** withSerializableRetry runs a Serializable transaction, retrying serialization failures. */
export async function withSerializableRetry<T>(
  prisma: PrismaClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isSerializationFailure(error) || attempt >= maxAttempts) {
        throw error;
      }
    }
  }
}

/** isSerializationFailure reports whether Postgres aborted the transaction to preserve serializability. */
function isSerializationFailure(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}
