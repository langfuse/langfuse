import { useSession } from "next-auth/react";

import {
  getSessionEnvironment,
  type MaybeSession,
} from "@/src/features/auth/lib/sessionAccessors";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useInternalFeaturesEnabled } from "@/src/features/feature-flags/hooks/useInternalFeaturesEnabled";

/** Whether the org can set access logging: only in "org" mode, since "enforced" and "disabled" leave nothing to choose. */
export function useShowAccessLoggingSetting(): boolean {
  const { data: session } = useSession();
  const hasEntitlement = useHasEntitlement("audit-logs");
  // Internal until read access is recorded on every surface.
  const internalFeaturesEnabled = useInternalFeaturesEnabled();
  return isAccessLoggingSettingShown(
    session,
    hasEntitlement,
    internalFeaturesEnabled,
  );
}

/** isAccessLoggingSettingShown reports whether the session's deployment lets the org choose access logging. */
function isAccessLoggingSettingShown(
  session: MaybeSession,
  hasEntitlement: boolean,
  internalFeaturesEnabled: boolean,
): boolean {
  return (
    internalFeaturesEnabled &&
    hasEntitlement &&
    getSessionEnvironment(session)?.accessAuditLogMode === "org"
  );
}
