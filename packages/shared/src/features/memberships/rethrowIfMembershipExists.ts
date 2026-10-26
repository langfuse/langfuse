import { Prisma } from "@prisma/client";

import { InvalidRequestError } from "../../errors";

/** rethrowIfMembershipExists converts a membership create's unique-constraint violation into an InvalidRequestError. */
export function rethrowIfMembershipExists(scope: "organization" | "project") {
  return (error: unknown): never => {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new InvalidRequestError(
        `User is already a member of this ${scope}`,
      );
    }
    throw error;
  };
}
