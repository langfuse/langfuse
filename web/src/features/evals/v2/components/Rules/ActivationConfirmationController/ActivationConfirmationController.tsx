import { useState, type ReactNode } from "react";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { useActivationEstimate } from "@/src/features/evals/v2/hooks/useActivationEstimate";
import type { ActivationConfirmationRequest } from "@/src/features/evals/v2/types/rules";
import { ActivationConfirmationDialog } from "../ActivationConfirmationDialog/ActivationConfirmationDialog";

export function ActivationConfirmationController({
  projectId,
  children,
}: {
  projectId: string;
  children: (control: {
    isEstimating: boolean;
    requestActivation: (
      request: ActivationConfirmationRequest,
    ) => Promise<void>;
  }) => ReactNode;
}) {
  const activation = useActivationEstimate({ projectId });
  const [isConfirming, setIsConfirming] = useState(false);

  return (
    <DialogController<ActivationConfirmationRequest>
      onBeforeClose={() => !isConfirming}
      renderDialog={({ state, closeDialog }) => (
        <ActivationConfirmationDialog
          confirmation={{ ...state, isConfirming }}
          estimate={activation.estimate}
          onConfirm={async () => {
            if (isConfirming) return;
            setIsConfirming(true);
            try {
              await state.onConfirm(activation.estimate.sampling ?? undefined);
            } catch {
              // Mutation handlers surface their own errors.
              return;
            } finally {
              setIsConfirming(false);
            }
            closeDialog();
          }}
        />
      )}
    >
      {({ openDialog }) =>
        children({
          isEstimating: activation.estimate.status === "estimating",
          requestActivation: async (request) => {
            const result = await activation.requestActivation(request);
            if (result) openDialog(request);
          },
        })
      }
    </DialogController>
  );
}
