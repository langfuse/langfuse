import { useMemo } from "react";

import { Button } from "@/src/components/ui/button";
import { isGatewayPreReleaseEnvironment } from "@/src/features/ai-gateway/fns/isGatewayPreReleaseEnvironment";
import { AddCustomModelDialogController } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/AddCustomModelDialogController/AddCustomModelDialogController";
import { GatewayConnectionModelsTable } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/GatewayConnectionModelsTable/GatewayConnectionModelsTable";
import type { useGatewayConnectionModels } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/hooks/useGatewayConnectionModels";
import { useGatewayModelAccess } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/hooks/useGatewayModelAccess";
import type { GatewayConnection } from "@/src/features/ai-gateway/types/gatewayProvider";

type ConnectionModelsEditorProps = {
  organizationId: string;
  connection: GatewayConnection;
  models: string[];
  connectionModels: ReturnType<typeof useGatewayConnectionModels>;
};

/**
 * Mounted once the connection and its models are loaded, which seeds the
 * toggle store. Keyed by connection so another connection gets a fresh store.
 */
export function ConnectionModelsEditor({
  organizationId,
  connection,
  models,
  connectionModels,
}: ConnectionModelsEditorProps) {
  const {
    isSaving,
    isAddingCustomModel,
    isTestingModel,
    addCustomModel,
    testModel,
    removeCustomModel,
    setModelsEnabled,
  } = connectionModels;
  const modelAccess = useGatewayModelAccess({
    organizationId,
    connectionId: connection.id,
    allowedModels: connection.allowedModels,
  });
  const toolbarActions = useMemo(
    () =>
      isGatewayPreReleaseEnvironment() ? (
        <AddCustomModelDialogController
          existingModels={models}
          isAdding={isAddingCustomModel}
          isTesting={isTestingModel}
          onAdd={addCustomModel}
          onTest={testModel}
        >
          {({ openDialog }) => (
            <Button
              type="button"
              variant="secondary"
              disabled={isSaving}
              onClick={openDialog}
            >
              Add custom model
            </Button>
          )}
        </AddCustomModelDialogController>
      ) : undefined,
    [
      models,
      isAddingCustomModel,
      isTestingModel,
      addCustomModel,
      testModel,
      isSaving,
    ],
  );

  return (
    <GatewayConnectionModelsTable
      provider={connection.provider}
      models={models}
      customModels={connection.customModels}
      modelAccessStore={modelAccess.store}
      isSaving={isSaving}
      toolbarActions={toolbarActions}
      onToggleModel={modelAccess.toggleModel}
      onRemoveCustomModel={removeCustomModel}
      onSetModelsEnabled={setModelsEnabled}
    />
  );
}
