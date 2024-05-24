import { getIsCloudEnvironment } from "@/src/ee/utils/getIsCloudEnvironment";

import { ApiError, UnauthorizedError, ForbiddenError } from "@langfuse/shared";
import { getAuthOptions } from "@/src/server/auth";
import { getServerSession } from "next-auth";

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
  if (!session) throw new UnauthorizedError("Unauthenticated");

  if (!session.user?.projects.some((project) => project.id === projectId))
    throw new ForbiddenError("User is not a member of this project");

  return { userId: session.user.id };
};
