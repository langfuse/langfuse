import { getServerSession } from "next-auth";

import { getIsCloudEnvironment } from "@/src/ee/utils/getIsCloudEnvironment";
import { getAuthOptions } from "@/src/server/auth";
import { isProjectMemberOrAdmin } from "@/src/server/utils/checkProjectMembershipOrAdmin";
import { ApiError, ForbiddenError, UnauthorizedError } from "@langfuse/shared";

export type AuthorizeRequestResult = {
  userId: string;
};

export const authorizeRequestOrThrow = async (
  projectId: string,
): Promise<AuthorizeRequestResult> => {
  if (!getIsCloudEnvironment())
    throw new ApiError("This endpoint is available in Langfuse cloud only.");

  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError("Unauthenticated");

  if (!isProjectMemberOrAdmin(session.user, projectId))
    throw new ForbiddenError("User is not a member of this project");

  return { userId: session.user.id };
};
