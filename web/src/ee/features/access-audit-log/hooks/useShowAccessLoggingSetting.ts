import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useInternalFeaturesEnabled } from "@/src/features/feature-flags/hooks/useInternalFeaturesEnabled";
import { useSession } from "next-auth/react";

/** Whether the org can set access logging: only in "org" mode, since "enforced" and "disabled" leave nothing to choose. */
export function useShowAccessLoggingSetting(): boolean {
  const { data: session } = useSession();
  const hasEntitlement = useHasEntitlement("audit-logs");
  // Internal until read access is recorded on every surface.
  const internalFeaturesEnabled = useInternalFeaturesEnabled();
  return (
    internalFeaturesEnabled &&
    hasEntitlement &&
    session?.environment.accessAuditLogMode === "org"
  );
}
