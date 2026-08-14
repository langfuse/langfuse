/**
 * Pure decision shared by the client capability hook (`useEvalCapabilities`)
 * and the server create-gate (`assertCanCreateLegacyEvalJob`): may a *new*
 * evaluator use the legacy (trace/dataset) experience?
 *
 * - events_only: legacy tables are no longer written → no new legacy evals.
 * - dual: self-hosted deployments always allow legacy; on Cloud, no new legacy.
 * - legacy: legacy is the only experience.
 * - forced-v3 projects keep the legacy experience unless events_only is set.
 * - undefined write mode (session still loading client-side) → not allowed,
 *   which keeps legacy options hidden until the mode is known.
 */
export function isNewLegacyEvalAllowed(params: {
  v4WriteMode: "legacy" | "dual" | "events_only" | undefined;
  isLangfuseCloud: boolean;
  isForceV3Project: boolean;
}): boolean {
  const { v4WriteMode, isLangfuseCloud, isForceV3Project } = params;
  if (v4WriteMode === "events_only") return false;
  if (isForceV3Project) return true;
  if (v4WriteMode === "dual") return !isLangfuseCloud;
  return v4WriteMode === "legacy";
}
