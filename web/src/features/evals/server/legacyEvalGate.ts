import { env } from "@/src/env.mjs";
import { InvalidRequestError } from "@langfuse/shared";
import { isLegacyEvalTarget } from "@/src/features/evals/utils/typeHelpers";
import { isNewLegacyEvalAllowed } from "@/src/features/evals/utils/legacyEvalGate";

/**
 * Server-side guard mirroring the UI capability hook: reject creating a *new*
 * legacy-target (trace/dataset) evaluator on deployments where the legacy
 * experience is disabled. Non-legacy targets and updates to existing
 * evaluators are unaffected.
 */
export function assertCanCreateLegacyEvalJob(params: { target: string }): void {
  const { target } = params;
  if (!isLegacyEvalTarget(target)) return;

  const allowed = isNewLegacyEvalAllowed({
    v4WriteMode: env.LANGFUSE_MIGRATION_V4_WRITE_MODE,
    isLangfuseCloud: Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION),
  });

  if (!allowed) {
    throw new InvalidRequestError(
      "Trace- and dataset-level evaluators are no longer available. Create an observation- or experiment-level evaluator instead.",
    );
  }
}
