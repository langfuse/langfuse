import { getServerSession } from "next-auth";

import { getAuthOptions } from "@/src/server/auth";
import {
  getDevBypassSession,
  isDevAuthBypassEnabled,
} from "@/src/server/devAuth";
import { isProjectMemberOrAdmin } from "@/src/server/utils/checkProjectMembershipOrAdmin";
import { ForbiddenError, UnauthorizedError } from "@langfuse/shared";

export type AuthorizeRequestResult = {
  userId: string;
};

export const authorizeRequestOrThrow = async (
  projectId: string,
): Promise<AuthorizeRequestResult> => {
  const session = isDevAuthBypassEnabled
    ? await getDevBypassSession()
    : await getServerSession(await getAuthOptions());
  if (!session?.user) throw new UnauthorizedError("Unauthenticated");

  if (!isProjectMemberOrAdmin(session.user, projectId))
    throw new ForbiddenError("User is not a member of this project");

  return { userId: session.user.id };
};
