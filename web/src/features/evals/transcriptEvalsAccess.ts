import { type Session } from "next-auth";
import { isEventsDispatchAvailable } from "@/src/features/events-dispatch/isEventsDispatchAvailable";
import { hasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

type TranscriptEvalsProject = { id: string; topicsEnabled?: boolean };

/**
 * Trace-transcript evals: the events-dispatch allowlist and preview, then
 * evals read access. `internalViewEnabled` is the current view-mode setting.
 * `isInternalViewEnabled(session)` is not used here: that session flag stays
 * true after internal features are turned off.
 */
export function canViewTraceTranscriptsEvals(
  session: Session | null,
  project: TranscriptEvalsProject | null | undefined,
  internalViewEnabled: boolean,
) {
  return (
    isEventsDispatchAvailable(session, project, internalViewEnabled) &&
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
