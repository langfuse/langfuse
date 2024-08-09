import { getServerSession } from "next-auth";

import { getAuthOptions } from "@/src/server/auth";
import { isProjectMemberOrAdmin } from "@/src/server/utils/checkProjectMembershipOrAdmin";
import { ApiError, ForbiddenError, UnauthorizedError } from "@langfuse/shared";
import { hasEntitlement } from "@/src/features/entitlements/server/hasEntitlement";

export type AuthorizeRequestResult = {
  userId: string;
};

export const authorizeRequestOrThrow = async (
  projectId: string,
): Promise<AuthorizeRequestResult> => {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError("Unauthenticated");

  const playgroundEntitlement = hasEntitlement({
    entitlement: "playground",
    projectId,
    sessionUser: session.user,
  });
  if (!playgroundEntitlement)
    throw new ApiError(
      "Your organization does not have access to the playground feature.",
    );

  if (!isProjectMemberOrAdmin(session.user, projectId))
    throw new ForbiddenError("User is not a member of this project");

  return { userId: session.user.id };
};
