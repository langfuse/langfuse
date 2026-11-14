import { useSession } from "next-auth/react";

import {
  type EvalCapabilities,
  getEvalCapabilities,
} from "@/src/features/evals/hooks/getEvalCapabilities";
import { useIsCodeEvalEnabled } from "@/src/features/evals/hooks/useIsCodeEvalEnabled";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useForceV3Experience } from "@/src/features/v4-migration/useForceV3Experience";
import { api } from "@/src/utils/api";

export { type EvalCapabilities } from "@/src/features/evals/hooks/getEvalCapabilities";

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
