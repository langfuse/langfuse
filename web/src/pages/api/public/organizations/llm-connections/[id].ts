import type { NextApiRequest, NextApiResponse } from "next";

import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server";
import { LlmConnectionService } from "@/src/features/llm-api-key/server/llmConnectionService";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import { shadowAuth, writeOrgError } from "@/src/features/public-api/server";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  DeleteLlmConnectionV1Query,
  DeleteLlmConnectionV1Response,
} from "@/src/features/public-api/types/llm-connections";

async function authenticate(req: NextApiRequest, res: NextApiResponse) {
  const auth = await shadowAuth({
    req,
    action: "organizationLlmApiKeys:CUD",
    allowedAccessLevels: ["organization"],
  });
  if (!auth.success) {
    writeOrgError(res, auth.error);
    return null;
  }
  if (
    !hasEntitlementBasedOnPlan({
      plan: auth.scope.plan,
      entitlement: "admin-api",
    })
  ) {
    res.status(403).json({
      error: "This feature is not available on your current plan.",
    });
    return null;
  }
  const rateLimit = await RateLimitService.getInstance().rateLimitRequest(
    auth.scope,
    "public-api",
  );
  if (rateLimit?.isRateLimited()) {
    rateLimit.sendRestResponseIfLimited(res);
    return null;
  }
  return auth.scope;
}

export default withMiddlewares({
  DELETE: async (req, res) => {
    const scope = await authenticate(req, res);
    if (!scope) return;

    const query = DeleteLlmConnectionV1Query.parse(req.query);
    await new LlmConnectionService().delete({
      owner: { type: "organization", organizationId: scope.orgId },
      id: query.id,
      actor: {
        apiKeyId: scope.apiKeyId,
        orgId: scope.orgId,
      },
    });

    return res.status(200).json(
      DeleteLlmConnectionV1Response.parse({
        message: "LLM connection successfully deleted",
      }),
    );
  },
});
