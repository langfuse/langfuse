import { getServerAuthSessionForRequest } from "@/src/server/auth";
import { isProjectMemberOrAdmin } from "@/src/server/utils/checkProjectMembershipOrAdmin";
import { ForbiddenError, UnauthorizedError } from "@langfuse/shared";
import { hasProjectAccess } from "../../rbac/utils/checkProjectAccess";

export type AuthorizeRequestResult = {
  userId: string;
};

export const authorizeRequestOrThrow = async (
  projectId: string,
  request: Request,
): Promise<AuthorizeRequestResult> => {
  const session = await getServerAuthSessionForRequest(request);
  if (!session?.user) throw new UnauthorizedError("Unauthenticated");

  if (!isProjectMemberOrAdmin(session.user, projectId))
    throw new ForbiddenError("User is not a member of this project");

  if (!hasProjectAccess({ session, projectId, scope: "playground:execute" }))
    throw new ForbiddenError("Insufficient permissions to execute playground.");

  return { userId: session.user.id };
};
