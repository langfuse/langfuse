import { env } from "@/src/env.mjs";
import { InvalidRequestError } from "@langfuse/shared";
import { isForceV3ExperienceProject } from "@langfuse/shared/src/server";
import { isLegacyEvalTarget } from "@/src/features/evals/utils/typeHelpers";
import { isNewLegacyEvalAllowed } from "@/src/features/evals/utils/legacyEvalGate";

/**
 * Server-side guard mirroring the UI capability hook: reject creating a *new*
 * legacy-target (trace/dataset) evaluator on deployments where the legacy
 * experience is disabled. Forced-v3 projects are exempt unless events_only is
 * set. Non-legacy targets and updates to existing evaluators are unaffected.
 */
export function assertCanCreateLegacyEvalJob(params: {
  projectId: string;
  target: string;
}): void {
  const { projectId, target } = params;
  if (!isLegacyEvalTarget(target)) return;

  const allowed = isNewLegacyEvalAllowed({
    v4WriteMode: env.LANGFUSE_MIGRATION_V4_WRITE_MODE,
    isLangfuseCloud: Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION),
    isForceV3Project: isForceV3ExperienceProject(projectId),
  });

  if (!allowed) {
    throw new InvalidRequestError(
      "Trace- and dataset-level evaluators are no longer available. Create an observation- or experiment-level evaluator instead.",
    );
  }
}
