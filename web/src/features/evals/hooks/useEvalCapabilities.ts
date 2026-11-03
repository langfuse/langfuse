import { useSession } from "next-auth/react";
import { api } from "@/src/utils/api";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { useIsCodeEvalEnabled } from "@/src/features/evals/hooks/useIsCodeEvalEnabled";
import { useForceV3Experience } from "@/src/features/v4-migration/useForceV3Experience";
import { isNewLegacyEvalAllowed } from "@/src/features/evals/utils/legacyEvalGate";

export interface EvalCapabilities {
  isNewCompatible: boolean;
  compatibilityCheckWasPerformed: boolean;
  allowLegacy: boolean;
  isLoading: boolean;
  hasLegacyEvals: boolean;
  forceV3Experience: boolean;
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
  const { isV4 } = useReadPath();
  const { enabled: isCodeEvalEnabled } = useIsCodeEvalEnabled();
  const isCodeEvalConfig =
    isCodeEvalEnabled && (options?.isCodeEvalTemplate ?? false);

  // Query SDK version info from events table (only when v4 beta is enabled)
  const sdkVersionInfo = api.events.getSdkVersionInfo.useQuery(
    { projectId },
    { enabled: isV4 && Boolean(projectId) },
  );

  // Determine OTEL status from SDK version info
  const isOtel = sdkVersionInfo.data?.isOtel ?? false;

  // Get eval counts including legacy eval count
  const evalCounts = api.evals.counts.useQuery(
    { projectId },
    { enabled: Boolean(projectId) },
  );
  const hasLegacyEvals = (evalCounts.data?.legacyConfigCount ?? 0) > 0;

  // The legacy eval experience depends on whether the deployment still writes
  // the legacy tables. Use explicit mode checks so we default to hidden while
  // the session is loading, which prevents a flash of legacy options.
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const v4WriteMode = session?.environment?.v4WriteMode;

  // Projects forced onto v3 keep legacy evals while legacy tables are written.
  const forceV3Experience = useForceV3Experience(projectId);

  // Whether a *new* config may use the legacy experience.
  const modeAllowsNewLegacy = isNewLegacyEvalAllowed({
    v4WriteMode,
    isLangfuseCloud,
    isForceV3Project: forceV3Experience,
  });

  return {
    isNewCompatible: isOtel,
    // True when v4 beta is enabled (SDK check query was run)
    compatibilityCheckWasPerformed: isV4,
    // Allow setting up new legacy evals only if: not a code eval AND the
    // deployment mode offers the legacy experience. Having existing legacy
    // evals no longer grants this; they remain editable via edit mode.
    allowLegacy: !isCodeEvalConfig && modeAllowsNewLegacy,
    isLoading:
      evalCounts.isLoading || isSessionLoading || sdkVersionInfo.isLoading,
    hasLegacyEvals,
    forceV3Experience,
  };
}
