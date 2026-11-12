import { type Session } from "next-auth";
import { TRPCError } from "@trpc/server";
import { isTopicsProjectEnabled } from "@langfuse/shared/topics/server";

import { canViewTraceTranscriptsEvals } from "@/src/features/evals/transcriptEvalsAccess";
import { isInternalViewEnabled } from "@/src/features/feature-flags/utils";

/** Server check for the trace transcript evals gate; the project allowlist comes from env. */
export function canUseTraceTranscriptEvals(
  session: Session | null,
  projectId: string,
) {
  return canViewTraceTranscriptsEvals(
    session,
    { id: projectId, topicsEnabled: isTopicsProjectEnabled(projectId) },
    isInternalViewEnabled(session),
  );
}

export function throwIfTraceTranscriptEvalsUnavailable(
  session: Session | null,
  projectId: string,
) {
  if (!canUseTraceTranscriptEvals(session, projectId)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Trace evaluations are not available for this project.",
    });
  }
}
