import { Prisma } from "@prisma/client";

import { type BaseError } from "../../errors/BaseError";

/** mapPrismaError returns a catch handler that throws error for the given Prisma error code and rethrows anything else. */
export function mapPrismaError<E extends BaseError>(code: string, error: E) {
  return (e: unknown): never => {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === code) {
      throw error;
    }
    throw e;
  };
}
