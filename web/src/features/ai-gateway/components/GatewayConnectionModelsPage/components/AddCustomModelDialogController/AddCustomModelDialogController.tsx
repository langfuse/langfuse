import { type ReactNode, useState } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { AddCustomModelDialog } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/AddCustomModelDialogController/components/AddCustomModelDialog/AddCustomModelDialog";
import { useGatewayConnectionModels } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/hooks/useGatewayConnectionModels";
import { useAllGatewayConnections } from "@/src/features/ai-gateway/components/GatewayModelsPage/components/GatewayModelsTab/hooks/useAllGatewayConnections";
import { useSelectGatewayConnection } from "@/src/features/ai-gateway/components/GatewayModelsPage/components/GatewayModelsTab/hooks/useSelectGatewayConnection";

export type AddCustomModelDialogControllerProps = {
  organizationId: string;
  /** The connection the dialog starts on; any other connection can be picked. */
  connectionId: string;
  children: (control: { openDialog: () => void }) => ReactNode;
};

export function AddCustomModelDialogController({
  children,
  ...dialogProps
}: AddCustomModelDialogControllerProps) {
  return (
    <DialogController
      renderDialog={({ closeDialog }) => (
        <ConnectedAddCustomModelDialog {...dialogProps} onAdded={closeDialog} />
      )}
    >
      {children}
    </DialogController>
  );
}

function ConnectedAddCustomModelDialog({
  organizationId,
  connectionId: initialConnectionId,
  onAdded,
}: Omit<AddCustomModelDialogControllerProps, "children"> & {
  onAdded: () => void;
}) {
  const [connectionId, setConnectionId] = useState(initialConnectionId);
  const { connections } = useAllGatewayConnections(organizationId);
  const selectConnection = useSelectGatewayConnection(organizationId);
  const {
    modelsQuery,
    isAddingCustomModel,
    isTestingModel,
    addCustomModel,
    testModel,
  } = useGatewayConnectionModels({ organizationId, connectionId });

  function handleAdded() {
    onAdded();
    // Show the connection the model was added to.
    if (connectionId !== initialConnectionId) selectConnection(connectionId);
  }

  return (
    <AddCustomModelDialog
      connections={connections ?? []}
      connectionId={connectionId}
      onConnectionChange={setConnectionId}
      existingModels={
        modelsQuery.data?.success ? modelsQuery.data.models : undefined
      }
      existingModelsFailed={
        modelsQuery.isError || modelsQuery.data?.success === false
      }
      isAdding={isAddingCustomModel}
      isTesting={isTestingModel}
      onAdd={addCustomModel}
      onAdded={handleAdded}
      onTest={testModel}
    />
  );
}
