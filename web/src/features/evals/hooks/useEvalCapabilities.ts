import { api } from "@/src/utils/api";

export interface EvalCapabilities {
  allowLegacy: boolean;
  allowPropagationFilters: boolean;
  isLoading: boolean;
}

/**
 * Hook to determine which eval configuration features are available
 * @param projectId - The project ID to check
 * @returns Capabilities object indicating which eval features are allowed
 */
export function useEvalCapabilities(projectId: string): EvalCapabilities {
  // Query OTEL SDK status
  const otelStatus = api.traces.resolveSdkVersion.useQuery(
    { projectId },
    { enabled: !!projectId },
  );

  // Get eval counts including legacy eval count
  const evalCounts = api.evals.counts.useQuery(
    { projectId },
    { enabled: !!projectId },
  );

  const hasLegacyEvals = (evalCounts.data?.legacyConfigCount ?? 0) > 0;
  const isOtel = otelStatus.data?.isOtel ?? false;
  const isPropagating = otelStatus.data?.isPropagating ?? false;

  return {
    // Allow legacy evals if user already has them OR if not using OTEL
    allowLegacy: hasLegacyEvals || !isOtel,
    // Allow propagation filters only when using OTEL and spans are propagating
    allowPropagationFilters: isOtel && isPropagating,
    isLoading: otelStatus.isLoading || evalCounts.isLoading,
  };
}
