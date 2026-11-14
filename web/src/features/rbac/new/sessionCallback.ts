import { type Session } from "next-auth";
import { type JWT } from "next-auth/jwt";

import { isInAppAgentInstanceEnabled } from "@langfuse/shared/in-app-agent/server/modelProvider";
import { isLangfuseAITracingConfigured } from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import { isGatewayDeployedOnInstance } from "@/src/features/ai-gateway/server/availability";
import { ContextResolver } from "@/src/features/auth/policy/contextResolver";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";
import { getSelfHostedInstancePlanServerSide } from "@/src/features/entitlements/server/getPlan";

/** sessionCallback builds the policy-engine session for a token, with a null context for a session that resolves to no live user. */
export async function sessionCallback(
  { token }: { session: Session; token: JWT },
  resolver: ContextResolver = new ContextResolver(),
): Promise<PolicySession> {
  const resolved = await resolver.resolve({
    kind: "user",
    userId: token.sub,
    sessionStartedAt: new Date(token.loginAt ?? 0),
  });
  if (resolved.success) {
    return { environment: sessionEnvironment(), authCtx: resolved.context };
  }
  if (resolved.error.httpCode === 401) {
    return { environment: sessionEnvironment(), authCtx: null };
  }
  throw resolved.error;
}

/** sessionEnvironment is the deployment's client-visible configuration. */
function sessionEnvironment(): Session["environment"] {
  return {
    enableExperimentalFeatures:
      env.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES === "true",
    inAppAgentEnabled: isInAppAgentInstanceEnabled(),
    aiFeaturesTracingConfigured: isLangfuseAITracingConfigured(),
    aiGatewayDeployed: isGatewayDeployedOnInstance(),
    selfHostedInstancePlan: getSelfHostedInstancePlanServerSide(),
    v4WriteMode: env.LANGFUSE_MIGRATION_V4_WRITE_MODE,
    apiKeyProjectRoleSelectionEnabled:
      env.API_AUTH_MIGRATION === "enforce" &&
      env.API_KEY_PROJECT_ROLES_ENABLE === "true",
    apiKeyOrgRoleSelectionEnabled:
      env.API_AUTH_MIGRATION === "enforce" &&
      env.API_KEY_ORG_ROLES_ENABLE === "true",
    accessAuditLogMode: env.LANGFUSE_AUDIT_LOG_ACCESS_EVENTS,
  };
}

/** PolicySession is the session on the policy engine: the deployment environment and the signed-in user's authorization context. */
export type PolicySession = {
  environment: Session["environment"];
  authCtx: AuthorizationContext | null;
};
