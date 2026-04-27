import { useSession } from "next-auth/react";
import { api } from "@/src/utils/api";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";

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
 * @returns Capabilities object indicating which eval features are allowed
 */
export function useEvalCapabilities(projectId: string): EvalCapabilities {
  const { data: session, status: sessionStatus } = useSession();
  const isSessionLoading = sessionStatus === "loading";
  const { isBetaEnabled } = useV4Beta();

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

  // Only hide legacy options for new cloud users (canToggleV4 = false)
  // Non-cloud deployments always see legacy options
  // Use === true to default to false while session is loading, preventing flash of legacy options
  // New users (canToggleV4 = false) default to observation-level evals regardless of v3/v4
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const canToggleV4 = session?.user?.canToggleV4 === true;

  return {
    isNewCompatible: isOtel,
    // True when v4 beta is enabled (SDK check query was run)
    compatibilityCheckWasPerformed: isBetaEnabled,
    // Allow legacy if: not cloud OR user has legacy evals OR user can toggle v4 (existing user)
    allowLegacy: !isLangfuseCloud || hasLegacyEvals || canToggleV4,
    // Allow propagation filters only when using OTEL and spans are propagating
    allowPropagationFilters: isOtel && isPropagating,
    isLoading:
      evalCounts.isLoading || isSessionLoading || sdkVersionInfo.isLoading,
    hasLegacyEvals,
  };
}
