import { Prisma } from "@prisma/client";

import { LangfuseConflictError } from "../../errors";

/** rethrowIfMembershipExists converts a membership create's unique-constraint violation into a LangfuseConflictError. */
export function rethrowIfMembershipExists(scope: "organization" | "project") {
  return (error: unknown): never => {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new LangfuseConflictError(
        `User is already a member of this ${scope}`,
      );
    }
    throw error;
  };
}
