import { type Session } from "next-auth";
import {
  getContextualFeatureFlags,
  isInternalViewEnabled,
} from "@/src/features/feature-flags/utils";
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

/** Project gate: trace evals are enabled for the project (deployment allowlist, resolved on the server). */
function isTraceEvalsEnabledForProject(
  project: TraceEvalsProject | null | undefined,
) {
  return project?.traceEvalsEnabled === true;
}
