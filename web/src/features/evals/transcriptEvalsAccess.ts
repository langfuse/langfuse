import { type Session } from "next-auth";
import { isEventsDispatchAvailable } from "@/src/features/events-dispatch/isEventsDispatchAvailable";
import { getContextualFeatureFlags } from "@/src/features/feature-flags/utils";
import { hasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

type TranscriptEvalsProject = { id: string; topicsEnabled?: boolean };

/**
 * Trace-transcript evals are available when all of these hold:
 * - the project is on the allowlist, AND
 * - internal view is on OR the `traceTranscriptEvals` preview is on, AND
 * - the user has `evaluator:read` OR `evaluationRule:read`.
 *
 * `internalViewEnabled` is the current view-mode setting. Do not derive it with
 * `isInternalViewEnabled(session)`: that session flag stays true after internal
 * features are turned off.
 */
export function canViewTraceTranscriptsEvals(
  session: Session | null,
  project: TranscriptEvalsProject | null | undefined,
  internalViewEnabled: boolean,
) {
  if (
    !isEventsDispatchAvailable(project, {
      internalViewEnabled,
      previewEnabled:
        getContextualFeatureFlags(session?.user, { projectId: project?.id })
          ?.traceTranscriptEvals === true,
    })
  ) {
    return false;
  }

  const canReadEvaluators = hasProjectAccess({
    session,
    projectId: project.id,
    scope: "evaluator:read",
  });
  const canReadEvaluationRules = hasProjectAccess({
    session,
    projectId: project.id,
    scope: "evaluationRule:read",
  });

  return canReadEvaluators || canReadEvaluationRules;
}
