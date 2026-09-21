import { Prisma } from "@langfuse/shared/src/db";

// An integration can be deleted while one of its runs is still in flight; a row
// write racing that delete throws P2025. Integration handlers treat that as
// "job is obsolete, complete it quietly" rather than as a failure to retry.
export const isRecordNotFoundError = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2025";
