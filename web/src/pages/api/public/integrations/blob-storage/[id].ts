import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { prisma } from "@langfuse/shared/src/db";
import { redis } from "@langfuse/shared/src/server";
import { type NextApiRequest, type NextApiResponse } from "next";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";
import {
  LangfuseNotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from "@langfuse/shared";

export default withMiddlewares({
  DELETE: handleDeleteBlobStorageIntegration,
});

async function handleDeleteBlobStorageIntegration(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // CHECK AUTH
  const authCheck = await new ApiAuthService(
    prisma,
    redis,
  ).verifyAuthHeaderAndReturnScope(req.headers.authorization);
  if (!authCheck.validKey) {
    throw new UnauthorizedError(authCheck.error ?? "Unauthorized");
  }

  // Check if using an organization API key
  if (
    authCheck.scope.accessLevel !== "organization" ||
    !authCheck.scope.orgId
  ) {
    throw new ForbiddenError(
      "Organization-scoped API key required for this operation.",
    );
  }

  // Check scheduled-blob-exports entitlement
  if (
    !hasEntitlementBasedOnPlan({
      plan: authCheck.scope.plan,
      entitlement: "scheduled-blob-exports",
    })
  ) {
    throw new ForbiddenError(
      "scheduled-blob-exports entitlement required for this feature.",
    );
  }
  const { id } = req.query;

  if (!id || typeof id !== "string") {
    throw new Error("Invalid integration ID");
  }

  // Check if the integration exists and belongs to a project in the organization
  const integration = await prisma.blobStorageIntegration.findUnique({
    where: { projectId: id },
    include: {
      project: {
        select: { orgId: true },
      },
    },
  });

  if (!integration || integration.project.orgId !== authCheck.scope.orgId) {
    throw new LangfuseNotFoundError("Blob storage integration not found");
  }

  // Delete the integration
  await prisma.blobStorageIntegration.delete({
    where: { projectId: id },
  });

  return res.status(200).json({
    message: "Blob storage integration successfully deleted",
  });
}
