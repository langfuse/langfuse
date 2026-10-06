import { Prisma } from "../db";

/** True when Prisma reports that a write matched no row (P2025). */
export const isPrismaRecordNotFoundError = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2025";
