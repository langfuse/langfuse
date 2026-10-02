import { LangfuseNotFoundError, Prisma } from "@langfuse/shared";

export const throwIfApiKeyMissing = (error: unknown): never => {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  ) {
    throw new LangfuseNotFoundError("API key not found");
  }

  throw error;
};
