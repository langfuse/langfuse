import { Prisma } from "@langfuse/shared/src/db";

export const isPrismaRecordNotFoundError = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2025";
