import { useCallback, useState } from "react";
import {
  requestRuleActivation,
  type ActivationEstimate,
} from "@/src/features/evals/v2/fns/requestRuleActivation";
import type { ActivationConfirmationRequest } from "@/src/features/evals/v2/types/rules";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

export type ActivationEstimateState = {
  status: "idle" | "estimating";
  sampling: number | null;
  estimates: ActivationEstimate[];
  unavailableEstimateCount: number;
  matchingObservations: number;
};

export function useActivationEstimate({ projectId }: { projectId: string }) {
  const utils = api.useUtils();
  const [estimate, setEstimate] = useState<ActivationEstimateState>({
    status: "idle",
    sampling: null,
    estimates: [],
    unavailableEstimateCount: 0,
    matchingObservations: 0,
  });
  const requestActivation = useCallback(
    async (
      request: ActivationConfirmationRequest,
      options?: {
        shouldRunMissingTest?: boolean;
        knownTestRunCostUsd?: number;
      },
    ) => {
      if (request.targets.length > 0) {
        setEstimate((current) => ({ ...current, status: "estimating" }));
      }
      try {
        const result = await requestRuleActivation({
          request,
          estimate: (targets) =>
            utils.client.evalsV2.activationCostEstimates.mutate({
              projectId,
              evaluatorIds: targets.map(({ evaluatorId }) => evaluatorId),
              filter: targets[0]?.filter ?? [],
              sampling: targets[0]?.sampling ?? 1,
              shouldRunMissingTest: options?.shouldRunMissingTest,
              knownTestRunCostUsd: options?.knownTestRunCostUsd,
            }),
        });
        if (!result) return null;
        setEstimate({
          status: "idle",
          sampling: result.estimates[0]?.sampling ?? null,
          estimates: result.estimates,
          unavailableEstimateCount: result.unavailableEstimateCount,
          matchingObservations: result.matchingObservations,
        });
        return result;
      } catch (error) {
        setEstimate((current) => ({ ...current, status: "idle" }));
        trpcErrorToast(error, "evaluator_rule.estimate_activation");
        return null;
      }
    },
    [projectId, utils.client],
  );

  const setSampling = useCallback(
    (sampling: number) => setEstimate((current) => ({ ...current, sampling })),
    [],
  );

  return {
    estimate,
    requestActivation,
    setSampling,
  };
}
