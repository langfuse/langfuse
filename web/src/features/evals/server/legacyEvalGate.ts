import { env } from "@/src/env.mjs";
import { InvalidRequestError } from "@langfuse/shared";
import { isForceV3ExperienceProject } from "@langfuse/shared/src/server";
import { isLegacyEvalTarget } from "@/src/features/evals/utils/typeHelpers";

/**
 * Pure decision mirroring the client `useEvalCapabilities` gate: may a *new*
 * evaluator use the legacy (trace/dataset) experience?
 * - events_only: legacy tables are no longer written → no new legacy evals.
 * - dual: self-hosted deployments always allow legacy; on Cloud, no new legacy.
 * - legacy: legacy is the only experience.
 * - forced-v3 projects always keep the legacy experience.
 */
export function isNewLegacyEvalAllowed(params: {
  v4WriteMode: "legacy" | "dual" | "events_only";
  isLangfuseCloud: boolean;
  isForceV3Project: boolean;
}): boolean {
  const { v4WriteMode, isLangfuseCloud, isForceV3Project } = params;
  if (isForceV3Project) return true;
  if (v4WriteMode === "events_only") return false;
  if (v4WriteMode === "dual") return !isLangfuseCloud;
  return v4WriteMode === "legacy";
}

/**
 * Server-side guard mirroring the UI capability hook: reject creating a *new*
 * legacy-target (trace/dataset) evaluator on deployments where the legacy
 * experience is disabled, unless the project is forced onto the v3 experience.
 * Non-legacy targets and updates to existing evaluators are unaffected.
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
