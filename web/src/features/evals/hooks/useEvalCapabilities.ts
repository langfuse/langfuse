import { type SessionContextValue, useSession } from "next-auth/react";

import {
  getSessionEnvironment,
  type MaybeSession,
} from "@/src/features/auth/lib/sessionAccessors";
import { useIsCodeEvalEnabled } from "@/src/features/evals/hooks/useIsCodeEvalEnabled";
import { isNewLegacyEvalAllowed } from "@/src/features/evals/utils/legacyEvalGate";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useForceV3Experience } from "@/src/features/v4-migration/useForceV3Experience";
import { api } from "@/src/utils/api";

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
  const { isV4 } = useReadPath();
  const { enabled: isCodeEvalEnabled } = useIsCodeEvalEnabled();

  // Query SDK version info from events table (only when v4 beta is enabled)
  const sdkVersionInfo = api.events.getSdkVersionInfo.useQuery(
    { projectId },
    { enabled: isV4 && Boolean(projectId) },
  );

  // Get eval counts including legacy eval count
  const evalCounts = api.evals.counts.useQuery(
    { projectId },
    { enabled: Boolean(projectId) },
  );

  const { isLangfuseCloud } = useLangfuseCloudRegion();

  // Projects forced onto v3 keep legacy evals while legacy tables are written.
  const forceV3Experience = useForceV3Experience(projectId);

  return getEvalCapabilities(session, sessionStatus, {
    isV4,
    isCodeEvalEnabled,
    isCodeEvalTemplate: options?.isCodeEvalTemplate,
    isOtel: sdkVersionInfo.data?.isOtel,
    isSdkVersionInfoLoading: sdkVersionInfo.isLoading,
    legacyConfigCount: evalCounts.data?.legacyConfigCount,
    isEvalCountsLoading: evalCounts.isLoading,
    isLangfuseCloud,
    forceV3Experience,
  });
}

/** getEvalCapabilities is which eval configuration features the session's deployment and project allow. */
function getEvalCapabilities(
  session: MaybeSession,
  sessionStatus: SessionContextValue["status"],
  {
    isV4,
    isCodeEvalEnabled,
    isCodeEvalTemplate,
    isOtel,
    isSdkVersionInfoLoading,
    legacyConfigCount,
    isEvalCountsLoading,
    isLangfuseCloud,
    forceV3Experience,
  }: {
    isV4: boolean;
    isCodeEvalEnabled: boolean;
    isCodeEvalTemplate: boolean | undefined;
    isOtel: boolean | undefined;
    isSdkVersionInfoLoading: boolean;
    legacyConfigCount: number | undefined;
    isEvalCountsLoading: boolean;
    isLangfuseCloud: boolean;
    forceV3Experience: boolean;
  },
): EvalCapabilities {
  const isSessionLoading = sessionStatus === "loading";
  const isCodeEvalConfig = isCodeEvalEnabled && (isCodeEvalTemplate ?? false);

  // Determine OTEL status from SDK version info
  const isNewCompatible = isOtel ?? false;

  const hasLegacyEvals = (legacyConfigCount ?? 0) > 0;

  // The legacy eval experience depends on whether the deployment still writes
  // the legacy tables. Use explicit mode checks so we default to hidden while
  // the session is loading, which prevents a flash of legacy options.
  const v4WriteMode = getSessionEnvironment(session)?.v4WriteMode;

  // Whether a *new* config may use the legacy experience.
  const modeAllowsNewLegacy = isNewLegacyEvalAllowed({
    v4WriteMode,
    isLangfuseCloud,
    isForceV3Project: forceV3Experience,
  });

  return {
    isNewCompatible,
    // True when v4 beta is enabled (SDK check query was run)
    compatibilityCheckWasPerformed: isV4,
    // Allow setting up new legacy evals only if: not a code eval AND the
    // deployment mode offers the legacy experience. Having existing legacy
    // evals no longer grants this; they remain editable via edit mode.
    allowLegacy: !isCodeEvalConfig && modeAllowsNewLegacy,
    isLoading:
      isEvalCountsLoading || isSessionLoading || isSdkVersionInfoLoading,
    hasLegacyEvals,
    forceV3Experience,
  };
}
