import { type Plan } from "@langfuse/shared";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session {
    /** authCtx is the policy-engine authorization context, null when the token resolves to no live user. */
    authCtx: AuthorizationContext | null;
    /** user is never sent; the signed-in user is authCtx's principal. */
    user?: never;

    environment: {
      // Run-time environment variables that need to be available client-side
      enableExperimentalFeatures: boolean;
      // Instance-wide in-app agent switch. Populated by the session callback.
      // Optional so existing session mocks need not set it.
      inAppAgentEnabled?: boolean;
      // Whether LANGFUSE_AI_FEATURES_PROJECT_ID is set, so Cloud orgs can
      // opt out of product traces. Optional so existing session mocks need
      // not set it.
      aiFeaturesTracingConfigured?: boolean;
      // False only on self-hosted instances without both gateway keys or with
      // LANGFUSE_AI_GATEWAY_DEPLOYED=false; Cloud, development and preview
      // always run a gateway. Optional so
      // existing session mocks need not set it.
      aiGatewayDeployed?: boolean;
      // Enables features that are only available under an enterprise/commercial license when self-hosting Langfuse
      selfHostedInstancePlan: Plan | null;
      // V4 migration write mode. Mirrors LANGFUSE_MIGRATION_V4_WRITE_MODE so the
      // client can tell whether the legacy traces/observations tables are still
      // written and gate the V4 preview / legacy experiences accordingly.
      // Optional so existing session mocks need not set it; the real session
      // callback always populates it.
      v4WriteMode?: "legacy" | "dual" | "events_only";
      // Role selection requires API_AUTH_MIGRATION=enforce and the scope's rollout flag.
      apiKeyProjectRoleSelectionEnabled?: boolean;
      apiKeyOrgRoleSelectionEnabled?: boolean;
      // Mirrors LANGFUSE_AUDIT_LOG_ACCESS_EVENTS. Optional so existing session
      // mocks need not set it.
      accessAuditLogMode?: "org" | "enforced" | "disabled";
    };
  }

  // Do not add `interface User extends DefaultUser` here.
  // OAuth provider `profile` callbacks return `User` before the session callback enriches it.
  // App-specific user fields therefore belong on the authorization context's principal.
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    loginAt?: number;
  }
}
