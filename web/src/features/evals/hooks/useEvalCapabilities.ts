import { useSession } from "next-auth/react";
import { api } from "@/src/utils/api";
export interface EvalCapabilities {
  isNewCompatible: boolean;
  allowLegacy: boolean;
  allowPropagationFilters: boolean;
  isLoading: boolean;
  hasLegacyEvals: boolean;
}

const mockOtelStatus = {
  isOtel: false,
  isPropagating: false,
};

/**
 * Hook to determine which eval configuration features are available
 * @param projectId - The project ID to check
 * @returns Capabilities object indicating which eval features are allowed
 */
export function useEvalCapabilities(projectId: string): EvalCapabilities {
  const { data: session } = useSession();

  // Query OTEL SDK status
  const { isOtel, isPropagating } = mockOtelStatus;

  // Get eval counts including legacy eval count
  const evalCounts = api.evals.counts.useQuery({ projectId });
  const hasLegacyEvals = (evalCounts.data?.legacyConfigCount ?? 0) > 0;

  // New users (canToggleV4 = false) should not see legacy options unless they have existing legacy evals
  // Default to true for non-cloud deployments to show legacy options
  const canToggleV4 = session?.user?.canToggleV4 ?? true;

  return {
    isNewCompatible: isOtel,
    // Allow legacy evals if user already has them OR if they can toggle v4 (existing users)
    allowLegacy: hasLegacyEvals || canToggleV4,
    // Allow propagation filters only when using OTEL and spans are propagating
    allowPropagationFilters: isOtel && isPropagating,
    isLoading: evalCounts.isLoading,
    hasLegacyEvals,
  };
}
