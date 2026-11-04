import { type Session } from "next-auth";
import { useSession } from "next-auth/react";
import {
  getContextualFeatureFlags,
  isInternalViewEnabled,
} from "@/src/features/feature-flags/utils";
import { useProject } from "@/src/features/projects/hooks";
import { hasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

type TopicsProject = { id: string; topicsEnabled?: boolean };

/** Visibility gate for every Topics surface: project gate, internal view or feature preview, and topics:read. */
export function canViewTopics(
  session: Session | null,
  project: TopicsProject | null | undefined,
) {
  return (
    !!project &&
    isTopicsEnabledForProject(project) &&
    (isInternalViewEnabled(session) ||
      getContextualFeatureFlags(session?.user, { projectId: project.id })
        ?.langfuseTopics === true) &&
    hasProjectAccess({ session, projectId: project.id, scope: "topics:read" })
  );
}

/** Resolves the project like the rest of the app, including the admin fallback for non-member admins. */
export function useCanViewTopics(projectId: string) {
  const session = useSession().data;
  const { project } = useProject(projectId);
  return canViewTopics(session, project);
}

/** Project gate: Topics is enabled for the project (deployment allowlist, resolved on the server). */
function isTopicsEnabledForProject(project: TopicsProject | null | undefined) {
  return project?.topicsEnabled === true;
}
