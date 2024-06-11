import { getServerSession } from "next-auth";

import { getAuthOptions } from "@/src/server/auth";
import { isProjectMemberOrAdmin } from "@/src/server/utils/checkProjectMembershipOrAdmin";
import { ApiError, ForbiddenError, UnauthorizedError } from "@langfuse/shared";
import { isEeEnabled } from "@/src/ee/utils/isEeEnabled";

export type AuthorizeRequestResult = {
  userId: string;
};

export const authorizeRequestOrThrow = async (
  projectId: string,
): Promise<AuthorizeRequestResult> => {
  if (!isEeEnabled)
    throw new ApiError(
      "LLM Playground is not yet available in the v2 open-source version.",
    );

  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError("Unauthenticated");

  if (!isProjectMemberOrAdmin(session.user, projectId))
    throw new ForbiddenError("User is not a member of this project");

  return { userId: session.user.id };
};
