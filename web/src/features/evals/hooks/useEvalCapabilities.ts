import { useSession } from "next-auth/react";
import { api } from "@/src/utils/api";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { useIsCodeEvalEnabled } from "@/src/features/evals/hooks/useIsCodeEvalEnabled";

export interface EvalCapabilities {
  isNewCompatible: boolean;
  compatibilityCheckWasPerformed: boolean;
  allowLegacy: boolean;
  allowPropagationFilters: boolean;
  isLoading: boolean;
  hasLegacyEvals: boolean;
}

/**
 * Hook to determine which eval configuration features are available
 * @param projectId - The project ID to check
 * @param options - Optional configuration
 * @param options.isCodeEvalTemplate - When true and code evals are enabled, disables legacy eval options
 * @returns Capabilities object indicating which eval features are allowed
 */
export function useEvalCapabilities(
  projectId: string,
  options?: {
    isCodeEvalTemplate?: boolean;
  },
): EvalCapabilities {
  const { data: session, status: sessionStatus } = useSession();
  const isSessionLoading = sessionStatus === "loading";
  const { isBetaEnabled } = useV4Beta();
  const { enabled: isCodeEvalEnabled } = useIsCodeEvalEnabled();
  const isCodeEvalConfig =
    isCodeEvalEnabled && (options?.isCodeEvalTemplate ?? false);

  // Query SDK version info from events table (only when v4 beta is enabled)
  const sdkVersionInfo = api.events.getSdkVersionInfo.useQuery(
    { projectId },
    { enabled: isBetaEnabled },
  );

  // Determine OTEL status from SDK version info
  const isOtel = sdkVersionInfo.data?.isOtel ?? false;
  // TODO: Implement propagation check
  const isPropagating = false;

  // Get eval counts including legacy eval count
  const evalCounts = api.evals.counts.useQuery({ projectId });
  const hasLegacyEvals = (evalCounts.data?.legacyConfigCount ?? 0) > 0;

  // The legacy eval experience depends on whether the deployment still writes
  // the legacy tables and on the user's rollout cohort. Use === true / explicit
  // mode checks so we default to hidden while the session is loading, which
  // prevents a flash of legacy options.
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const canToggleV4 = session?.user?.canToggleV4 === true;
  const v4WriteMode = session?.environment?.v4WriteMode;

  // Whether a *new* config may use the legacy experience (independent of
  // hasLegacyEvals, which always keeps legacy visible so existing legacy
  // evaluators stay manageable):
  // - events_only: legacy tables are no longer written → no new legacy evals.
  // - dual: self-hosted deployments always allow legacy; on Cloud only cohorts
  //   that can still toggle V4 (orgs created before the rollout cutoff).
  // - legacy: legacy is the only experience.
  const modeAllowsNewLegacy =
    v4WriteMode === "events_only"
      ? false
      : v4WriteMode === "dual"
        ? isLangfuseCloud
          ? canToggleV4
          : true
        : v4WriteMode === "legacy"; // legacy → true; undefined (loading) → false

  return {
    isNewCompatible: isOtel,
    // True when v4 beta is enabled (SDK check query was run)
    compatibilityCheckWasPerformed: isBetaEnabled,
    // Allow legacy if: not a code eval AND (user has legacy evals to manage OR
    // the deployment mode/cohort offers the legacy experience).
    allowLegacy: !isCodeEvalConfig && (hasLegacyEvals || modeAllowsNewLegacy),
    // Allow propagation filters only when using OTEL and spans are propagating
    allowPropagationFilters: isOtel && isPropagating,
    isLoading:
      evalCounts.isLoading || isSessionLoading || sdkVersionInfo.isLoading,
    hasLegacyEvals,
  };
}
