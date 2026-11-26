import { type Session } from "next-auth";
import { ForbiddenError } from "@langfuse/shared";
import { isTraceEvalsProjectEnabled } from "@langfuse/shared/src/server";

import { canViewTraceTranscriptsEvals } from "@/src/features/evals/transcriptEvalsAccess";

/** Server check for the trace evals gate; the project allowlist comes from env. */
export function canUseTraceTranscriptEvals(
  session: Session | null,
  projectId: string,
) {
  return canViewTraceTranscriptsEvals(session, {
    id: projectId,
    traceEvalsEnabled: isTraceEvalsProjectEnabled(projectId),
  });
}

export function throwIfTraceTranscriptEvalsUnavailable(
  session: Session | null,
  projectId: string,
) {
  if (!canUseTraceTranscriptEvals(session, projectId)) {
    throw new ForbiddenError(
      "Trace evaluations are not available for this project.",
    );
  }
}
