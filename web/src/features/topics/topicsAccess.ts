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
    isTopicsPreviewAvailable(session, project) &&
    hasProjectAccess({ session, projectId: project.id, scope: "topics:read" })
  );
}

/** Project gate, internal view or the Topics preview, shared by every gate built on them. */
function isTopicsPreviewAvailable(
  session: Session | null,
  project: TopicsProject | null | undefined,
): project is TopicsProject {
  return (
    !!project &&
    isEventsDispatchEnabledForProject(project) &&
    (isInternalViewEnabled(session) ||
      getContextualFeatureFlags(session?.user, { projectId: project.id })
        ?.langfuseTopics === true)
  );
}

/** Resolves the project like the rest of the app. */
export function useCanViewTopics(projectId: string) {
  const session = useSession().data;
  const { project } = useProject(projectId);
  return canViewTopics(session, project);
}

/**
 * Events-dispatch gate: the same allowlist and Topics preview as canViewTopics,
 * with evals read access instead of topics:read.
 */
export function canUseEventsDispatch(
  session: Session | null,
  project: TopicsProject | null | undefined,
) {
  return (
    isTopicsPreviewAvailable(session, project) &&
    hasEvalsReadAccess(session, project.id)
  );
}

/** Deployment allowlist for the project, resolved on the server as `topicsEnabled`. */
function isEventsDispatchEnabledForProject(
  project: TopicsProject | null | undefined,
) {
  return project?.topicsEnabled === true;
}

/** Same access as the Evaluators navigation: either evals read scope. */
function hasEvalsReadAccess(session: Session | null, projectId: string) {
  return (
    hasProjectAccess({ session, projectId, scope: "evaluator:read" }) ||
    hasProjectAccess({ session, projectId, scope: "evaluationRule:read" })
  );
}
