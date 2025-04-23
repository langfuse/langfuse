import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { type NextApiRequest } from "next";
import { UnauthorizedError, ForbiddenError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  type AuthHeaderValidVerificationResult,
  redis,
} from "@langfuse/shared/src/server";

export async function authorizePromptRequestOrThrow(req: NextApiRequest) {
  const authCheck = await new ApiAuthService(
    prisma,
    redis,
  ).verifyAuthHeaderAndReturnScope(req.headers.authorization);
  if (!authCheck.validKey) throw new UnauthorizedError(authCheck.error);
  if (authCheck.scope.accessLevel !== "project")
    throw new ForbiddenError(
      `Access denied - need to use basic auth with secret key to ${req.method} prompts`,
    );
  if (!authCheck.scope.projectId) {
    throw new ForbiddenError(`No valid projectId found for auth token`);
  }
  return authCheck as AuthHeaderValidVerificationResult & {
    scope: { projectId: string; accessLevel: "project" };
  };
}
