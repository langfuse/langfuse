import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import type { ActivationEstimateState } from "@/src/features/evals/v2/hooks/useActivationEstimate";
import type { ActivationConfirmationRequest } from "@/src/features/evals/v2/types/rules";
import { ActivationCostEstimateDetails } from "./components/ActivationCostEstimateDetails/ActivationCostEstimateDetails";

export function ActivationConfirmationDialog({
  confirmation,
  estimate,
  onSamplingChange,
  onConfirm,
}: {
  confirmation: Pick<
    ActivationConfirmationRequest,
    "title" | "description" | "confirmLabel"
  > & { isConfirming: boolean };
  estimate: ActivationEstimateState;
  onSamplingChange?: (sampling: number) => void;
  onConfirm: () => void;
}) {
  const hasOnlyUnavailableEstimates =
    estimate.estimates.length === 0 && estimate.unavailableEstimateCount > 0;
  const hasCostDetails =
    estimate.estimates.length > 0 ||
    estimate.unavailableEstimateCount > 0 ||
    estimate.matchingObservations === 0;

  return (
    <Dialog
      closeOnInteractionOutside
      title={confirmation.title}
      size={hasOnlyUnavailableEstimates ? "sm" : "md"}
      actions={[
        {
          label: confirmation.confirmLabel,
          loading: confirmation.isConfirming,
          onClick: onConfirm,
        },
      ]}
    >
      <Dialog.Body>
        {hasCostDetails ? (
          <ActivationCostEstimateDetails
            estimates={estimate.estimates}
            unavailableEstimateCount={estimate.unavailableEstimateCount}
            matchingObservations={estimate.matchingObservations}
            sampling={estimate.sampling ?? 1}
            onSamplingChange={onSamplingChange}
          />
        ) : (
          <p className="text-muted-foreground">{confirmation.description}</p>
        )}
      </Dialog.Body>
    </Dialog>
  );
}
