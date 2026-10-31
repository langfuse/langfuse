import { type Plan } from "@langfuse/shared";

import { env } from "@/src/env.mjs";
import { isAuditLogEnabled } from "@/src/features/audit-logs/isAuditLogEnabled";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server";

/** The org facts the gate reads. The session and API-key scopes carry them, so checking a read needs no query. */
export type AccessAuditOrg = {
  orgId: string;
  plan: Plan;
  accessAuditLogEnabled: boolean;
};

/**
 * Whether reads in this organization are recorded as access events, per
 * LANGFUSE_AUDIT_LOG_ACCESS_EVENTS. "enforced" follows the instance, not the
 * org's plan: every org on Langfuse Cloud, every org on a self-hosted instance
 * with an enterprise license, and none without one.
 *
 * The staging kill switch LANGFUSE_AUDIT_LOG_STAGING_ENABLED turns recording
 * off in every mode. Reads then succeed unrecorded rather than fail.
 */
export function isAccessAuditLogEnabled(
  org: Pick<AccessAuditOrg, "plan" | "accessAuditLogEnabled">,
): boolean {
  if (env.LANGFUSE_AUDIT_LOG_STAGING_ENABLED !== "true") return false;

  switch (env.LANGFUSE_AUDIT_LOG_ACCESS_EVENTS) {
    case "disabled":
      return false;
    case "enforced":
      return isAuditLogEnabled();
    case "org":
      return (
        org.accessAuditLogEnabled &&
        hasEntitlementBasedOnPlan({ plan: org.plan, entitlement: "audit-logs" })
      );
  }
}
