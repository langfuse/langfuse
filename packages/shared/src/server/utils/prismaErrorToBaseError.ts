import { Prisma } from "@prisma/client";

import { type BaseError } from "../../errors/BaseError";

/** prismaErrorToBaseError returns a catch handler that throws error for the given Prisma error code and rethrows anything else. */
export function prismaErrorToBaseError<E extends BaseError>(
  code: PrismaErrorCode,
  error: E,
) {
  return (e: unknown): never => {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === code) {
      throw error;
    }
    throw e;
  };
}

/** PrismaErrorCode lists the Prisma error codes handled in this repo. */
export type PrismaErrorCode =
  | "P1001"
  | "P2002"
  | "P2003"
  | "P2016"
  | "P2024"
  | "P2025"
  | "P2034";
