import { type Session } from "next-auth";
import { useSession } from "next-auth/react";
import { getContextualFeatureFlags } from "@/src/features/feature-flags/utils";
import { hasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

/** The one Topics visibility gate: feature preview, project allowlist (resolved into the session) and topics:read. */
export function canViewTopics(session: Session | null, projectId: string) {
  const project = session?.user?.organizations
    .flatMap((organization) => organization.projects)
    .find((candidate) => candidate.id === projectId);
  return (
    project?.topicsEnabled === true &&
    getContextualFeatureFlags(session?.user, { projectId })?.langfuseTopics ===
      true &&
    hasProjectAccess({ session, projectId, scope: "topics:read" })
  );
}

export function useCanViewTopics(projectId: string) {
  return canViewTopics(useSession().data, projectId);
}
