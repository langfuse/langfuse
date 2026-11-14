import {
  getSessionEnvironment,
  type MaybeSession,
} from "@/src/features/auth/lib/sessionAccessors";

/** isAccessLoggingSettingShown reports whether the org may choose access logging, which only the session deployment's "org" mode allows. */
export function isAccessLoggingSettingShown(
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
