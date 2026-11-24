import type { ReactNode } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import type { TagAutocompleteOption } from "@/src/components/TagAutocompleteInput/TagAutocompleteInput";
import { GatewayBulkGuardrailTargetsDialog } from "@/src/features/ai-gateway/components/GatewayGuardrailsPage/components/GatewayGuardrailsTable/components/GatewayBulkGuardrailTargetsDialogController/components/GatewayBulkGuardrailTargetsDialog/GatewayBulkGuardrailTargetsDialog";
import type { GatewayGuardrailDeleteTargetInput } from "@/src/features/ai-gateway/components/GatewayGuardrailsPage/hooks/useDeleteGatewayGuardrails";
import { targetOptionsToAssignments } from "@/src/features/ai-gateway/fns/targetOptionsToAssignments";
import { useGatewayGuardrailTargetPicker } from "@/src/features/ai-gateway/hooks/useGatewayGuardrailTargetPicker";
import { useInvalidateGatewayGuardrails } from "@/src/features/ai-gateway/hooks/useInvalidateGatewayGuardrails";
import {
  api,
  reportNonTrpcError,
  reportTrpcErrorWithoutToast,
} from "@/src/utils/api";

export type BulkGuardrailTargetsState = {
  target: GatewayGuardrailDeleteTargetInput;
  selectedCount: number;
  initialTargets: TagAutocompleteOption[];
  onAfterSave: () => void;
};

export type GatewayBulkGuardrailTargetsDialogControllerProps = {
  organizationId: string;
  children: (control: {
    openDialog: (state: BulkGuardrailTargetsState) => void;
  }) => ReactNode;
};

export function GatewayBulkGuardrailTargetsDialogController({
  organizationId,
  children,
}: GatewayBulkGuardrailTargetsDialogControllerProps) {
  const invalidateGuardrails = useInvalidateGatewayGuardrails(organizationId);
  const mutation = api.aiGateway.setGuardrailsAssignments.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-guardrails"),
  });

  return (
    <DialogController<BulkGuardrailTargetsState>
      onBeforeClose={() => !mutation.isPending}
      onDismiss={() => mutation.reset()}
      renderDialog={({ state, closeDialog }) => (
        <ConnectedBulkTargetsDialog
          organizationId={organizationId}
          state={state}
          isSubmitting={mutation.isPending}
          errorMessage={
            mutation.isError ? (mutation.error?.message ?? "Try again.") : null
          }
          onSubmit={async (targets) => {
            try {
              await mutation.mutateAsync({
                orgId: organizationId,
                target: state.target,
                assignments: targetOptionsToAssignments(targets),
              });
              state.onAfterSave();
              closeDialog();
              mutation.reset();
            } catch (error) {
              reportNonTrpcError(error, "ai-gateway-guardrails");
            } finally {
              await invalidateGuardrails();
            }
          }}
        />
      )}
    >
      {({ openDialog }) => children({ openDialog })}
    </DialogController>
  );
}

type ConnectedBulkTargetsDialogProps = {
  organizationId: string;
  state: BulkGuardrailTargetsState;
  isSubmitting: boolean;
  errorMessage: string | null;
  onSubmit: (targets: TagAutocompleteOption[]) => void;
};

function ConnectedBulkTargetsDialog({
  organizationId,
  state,
  isSubmitting,
  errorMessage,
  onSubmit,
}: ConnectedBulkTargetsDialogProps) {
  const targetPicker = useGatewayGuardrailTargetPicker(organizationId, true);

  return (
    <GatewayBulkGuardrailTargetsDialog
      selectedCount={state.selectedCount}
      initialTargets={state.initialTargets}
      targetPicker={targetPicker}
      isSubmitting={isSubmitting}
      errorMessage={errorMessage}
      onSubmit={onSubmit}
    />
  );
}
