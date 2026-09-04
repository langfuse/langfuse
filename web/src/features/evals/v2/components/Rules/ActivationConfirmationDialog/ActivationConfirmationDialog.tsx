import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import type {
  ActivationConfirmationState,
  ActivationEstimateState,
} from "@/src/features/evals/v2/hooks/useActivationConfirmation";
import { ActivationCostEstimateDetails } from "./components/ActivationCostEstimateDetails/ActivationCostEstimateDetails";

export function ActivationConfirmationDialog({
  confirmation,
  estimate,
  onOpenChange,
  onSamplingChange,
  onConfirm,
}: {
  confirmation: ActivationConfirmationState;
  estimate: ActivationEstimateState;
  onOpenChange: (open: boolean) => void;
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
    <ConfirmDialog
      open={confirmation.open}
      onOpenChange={onOpenChange}
      title={confirmation.title}
      description={hasCostDetails ? undefined : confirmation.description}
      confirmLabel={confirmation.confirmLabel}
      confirmVariant="default"
      size={hasOnlyUnavailableEstimates ? "default" : "lg"}
      loading={confirmation.isConfirming}
      loadingText="Validating rule..."
      onConfirm={onConfirm}
    >
      {hasCostDetails ? (
        <ActivationCostEstimateDetails
          estimates={estimate.estimates}
          unavailableEstimateCount={estimate.unavailableEstimateCount}
          matchingObservations={estimate.matchingObservations}
          sampling={estimate.sampling ?? 1}
          onSamplingChange={onSamplingChange}
        />
      ) : null}
    </ConfirmDialog>
  );
}
