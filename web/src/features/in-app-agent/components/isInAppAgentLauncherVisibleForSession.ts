import {
  getSessionEnvironment,
  type MaybeSession,
  type SessionOrganization,
} from "@/src/features/rbac/new/sessionAccessors";

/** isInAppAgentLauncherVisibleForSession reports whether Assistant entry points show, which needs the session deployment's instance switch, availability, entitlement, and an organization. */
export function isInAppAgentLauncherVisibleForSession(
  session: MaybeSession,
  isAvailable: boolean,
  hasInAppAgentEntitlement: boolean,
  organization: SessionOrganization | null | undefined,
) {
  const instanceEnabled =
    getSessionEnvironment(session)?.inAppAgentEnabled ?? false;

  return (
    instanceEnabled &&
    isAvailable &&
    hasInAppAgentEntitlement &&
    Boolean(organization)
  );
}
