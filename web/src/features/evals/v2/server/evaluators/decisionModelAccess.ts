import { EvalTemplateType, ForbiddenError } from "@langfuse/shared";
import type { Session } from "next-auth";

import { env } from "@/src/env.mjs";
import { getContextualFeatureFlags } from "@/src/features/feature-flags/utils";

/**
 * Server-side counterpart of the `decisionModelEvaluators` flag check in the
 * UI: the experimental type is only accepted for admins, deployments with
 * experimental features enabled, or users/organizations carrying the flag.
 */
function isDecisionModelEvaluatorEnabled(params: {
  session: Session;
  projectId: string;
}): boolean {
  if (env.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES === "true") return true;
  if (params.session.user?.admin === true) return true;
  return (
    getContextualFeatureFlags(params.session.user, {
      projectId: params.projectId,
    })?.decisionModelEvaluators === true
  );
}

export function assertDecisionModelEvaluatorAllowed(params: {
  session: Session;
  projectId: string;
  definition: { type: EvalTemplateType };
}) {
  if (params.definition.type !== EvalTemplateType.DECISION_MODEL) return;
  if (isDecisionModelEvaluatorEnabled(params)) return;
  throw new ForbiddenError(
    "Decision-model evaluators are experimental and not enabled for this project.",
  );
}
