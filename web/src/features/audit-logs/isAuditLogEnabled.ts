import { env } from "@/src/env.mjs";
import {
  getSelfHostedInstancePlanServerSide,
  hasEntitlementBasedOnPlan,
} from "@/src/features/entitlements/server";

/**
 * Whether audit log records may be written on this instance.
 *
 * Audit logs are an enterprise feature. Reading them is already gated on the
 * `audit-logs` entitlement (see `auditLogs` router and `batchExport`), but the
 * write path historically had no gate at all, so unlicensed self-hosted
 * instances accumulated records they can never view.
 *
 * The self-hosted branch derives from the same entitlement table the read path
 * uses, rather than hardcoding "enterprise license => audit logs", so the two
 * cannot drift apart. Today that means only `langfuse_ee_*` keys
 * (`self-hosted:enterprise`) write records: `self-hosted:pro` and `oss` do not.
 *
 * On Langfuse Cloud records are always written, on every plan. Retaining the
 * trail regardless of plan means upgrading to a plan that includes the audit
 * log viewer does not surface a gap in history.
 *
 * Synchronous and free of IO: both helpers read env that is parsed once at
 * startup, so this is safe to call on every mutation.
 */
export function isAuditLogEnabled(): boolean {
  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined) return true;

  return hasEntitlementBasedOnPlan({
    plan: getSelfHostedInstancePlanServerSide(),
    entitlement: "audit-logs",
  });
}
