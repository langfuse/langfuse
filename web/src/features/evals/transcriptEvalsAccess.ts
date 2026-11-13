import { type Session } from "next-auth";
import { useSession } from "next-auth/react";
import {
  getContextualFeatureFlags,
  isInternalViewEnabled,
} from "@/src/features/feature-flags/utils";
import { useProject } from "@/src/features/projects/hooks";
import { hasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

type TraceEvalsProject = { id: string; traceEvalsEnabled?: boolean };

/** Visibility gate for every trace evals surface: project gate, internal view or feature preview, and evaluator:read or evaluationRule:read. */
export function canViewTraceTranscriptsEvals(
  session: Session | null,
  project: TraceEvalsProject | null | undefined,
) {
  return (
    !!project &&
    isTraceEvalsEnabledForProject(project) &&
    (isInternalViewEnabled(session) ||
      getContextualFeatureFlags(session?.user, { projectId: project.id })
        ?.traceTranscriptEvals === true) &&
    (hasProjectAccess({
      session,
      projectId: project.id,
      scope: "evaluator:read",
    }) ||
      hasProjectAccess({
        session,
        projectId: project.id,
        scope: "evaluationRule:read",
      }))
  );
}

/** Resolves the project like the rest of the app. */
export function useCanViewTraceTranscriptsEvals(projectId: string) {
  const session = useSession().data;
  const { project } = useProject(projectId);
  return canViewTraceTranscriptsEvals(session, project);
}

/** Project gate: trace evals are enabled for the project (deployment allowlist, resolved on the server). */
function isTraceEvalsEnabledForProject(
  project: TraceEvalsProject | null | undefined,
) {
  return project?.traceEvalsEnabled === true;
}
