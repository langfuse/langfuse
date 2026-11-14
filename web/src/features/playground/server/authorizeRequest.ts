import { getServerAuthSessionForRequest } from "@/src/server/auth";
import { isProjectMember } from "@/src/server/utils/checkProjectMembership";
import { getSessionUserId } from "@/src/features/rbac/new/sessionAccessors";
import { ForbiddenError, UnauthorizedError } from "@langfuse/shared";
import { hasProjectAccess } from "@/src/features/rbac/new/checkProjectAccess";

export type AuthorizeRequestResult = {
  userId: string;
};

export const authorizeRequestOrThrow = async (
  projectId: string,
  request: Request,
): Promise<AuthorizeRequestResult> => {
  const session = await getServerAuthSessionForRequest(request);
  const userId = getSessionUserId(session);
  if (!session || !userId) throw new UnauthorizedError("Unauthenticated");

  if (!isProjectMember(session, projectId))
    throw new ForbiddenError("User is not a member of this project");

  if (!hasProjectAccess({ session, projectId, scope: "playground:execute" }))
    throw new ForbiddenError("Insufficient permissions to execute playground.");

  return { userId };
};
