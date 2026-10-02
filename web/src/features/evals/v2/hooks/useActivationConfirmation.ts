import { useCallback, useState } from "react";
import {
  requestRuleActivation,
  type ActivationEstimate,
} from "@/src/features/evals/v2/fns/requestRuleActivation";
import type { ActivationConfirmationRequest } from "@/src/features/evals/v2/types/rules";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

export type ActivationConfirmationState = {
  open: boolean;
  isConfirming: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pendingAction: ((sampling?: number) => Promise<void>) | null;
};

export type ActivationEstimateState = {
  status: "idle" | "estimating";
  sampling: number | null;
  estimates: ActivationEstimate[];
  unavailableEstimateCount: number;
  matchingObservations: number;
};

export function useActivationConfirmation({
  projectId,
}: {
  projectId: string;
}) {
  const utils = api.useUtils();
  const [confirmation, setConfirmation] = useState<ActivationConfirmationState>(
    {
      open: false,
      isConfirming: false,
      title: "Activate evaluation rule?",
      description:
        "Review the estimated cost before activating this evaluation rule.",
      confirmLabel: "Activate rule",
      pendingAction: null,
    },
  );
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
        setConfirmation({
          open: true,
          isConfirming: false,
          title: request.title,
          description: request.description,
          confirmLabel: request.confirmLabel,
          pendingAction: request.onConfirm,
        });
        return result;
      } catch (error) {
        setEstimate((current) => ({ ...current, status: "idle" }));
        trpcErrorToast(error);
        return null;
      }
    },
    [projectId, utils.client],
  );

  const setOpen = useCallback(
    (open: boolean) => setConfirmation((current) => ({ ...current, open })),
    [],
  );
  const setSampling = useCallback(
    (sampling: number) => setEstimate((current) => ({ ...current, sampling })),
    [],
  );
  const pendingAction = confirmation.pendingAction;
  const sampling = estimate.sampling;
  const confirmActivation = useCallback(async () => {
    if (!pendingAction) return;
    setConfirmation((current) => ({ ...current, isConfirming: true }));
    try {
      await pendingAction(sampling ?? undefined);
      setConfirmation((current) => ({ ...current, open: false }));
    } catch {
      // Mutation handlers surface their own errors.
    } finally {
      setConfirmation((current) => ({ ...current, isConfirming: false }));
    }
  }, [pendingAction, sampling]);

  return {
    confirmation,
    estimate,
    requestActivation,
    setOpen,
    setSampling,
    confirmActivation,
  };
}
