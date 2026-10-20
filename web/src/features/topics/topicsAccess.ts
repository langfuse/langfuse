import { type Session } from "next-auth";
import { useSession } from "next-auth/react";
import { getContextualFeatureFlags } from "@/src/features/feature-flags/utils";
import { hasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

/** Project gate: Topics is enabled for the project (deployment allowlist, resolved into the session). */
export function isTopicsEnabledForProject(
  session: Session | null,
  projectId: string,
) {
  return (
    session?.user?.organizations
      .flatMap((organization) => organization.projects)
      .find((project) => project.id === projectId)?.topicsEnabled === true
  );
}

/** Visibility gate for every Topics surface: project gate, the user's feature preview and topics:read. */
export function canViewTopics(session: Session | null, projectId: string) {
  return (
    isTopicsEnabledForProject(session, projectId) &&
    getContextualFeatureFlags(session?.user, { projectId })?.langfuseTopics ===
      true &&
    hasProjectAccess({ session, projectId, scope: "topics:read" })
  );
}

export function useCanViewTopics(projectId: string) {
  return canViewTopics(useSession().data, projectId);
}
