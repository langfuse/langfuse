import { type ReactNode, useMemo } from "react";

import { Button } from "@/src/components/ui/button";
import { AddCustomModelDialogController } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/AddCustomModelDialogController/AddCustomModelDialogController";
import { GatewayConnectionModelsTable } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/GatewayConnectionModelsTable/GatewayConnectionModelsTable";
import type { useGatewayConnectionModels } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/hooks/useGatewayConnectionModels";
import { useGatewayModelAccess } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/hooks/useGatewayModelAccess";
import type { GatewayConnection } from "@/src/features/ai-gateway/types/gatewayProvider";
import type { GatewayApiFormat } from "@/src/features/ai-gateway/server/provider/registry";

type ConnectionModelsEditorProps = {
  organizationId: string;
  connection: GatewayConnection;
  models: string[];
  /** The formats of the models the provider's catalog reports them for. */
  modelApiFormats?: Readonly<Record<string, GatewayApiFormat[]>>;
  connectionModels: ReturnType<typeof useGatewayConnectionModels>;
  filters: ReactNode;
};

/**
 * Mounted once the connection and its models are loaded, which seeds the
 * toggle store. Keyed by connection so another connection gets a fresh store.
 */
export function ConnectionModelsEditor({
  organizationId,
  connection,
  models,
  modelApiFormats,
  connectionModels,
  filters,
}: ConnectionModelsEditorProps) {
  const { isSaving, removeCustomModel, setModelsEnabled } = connectionModels;
  const modelAccess = useGatewayModelAccess({
    organizationId,
    connectionId: connection.id,
    allowedModels: connection.allowedModels,
  });
  const toolbarActions = useMemo(
    () => (
      <AddCustomModelDialogController
        organizationId={organizationId}
        connectionId={connection.id}
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
    ),
    [organizationId, connection.id, isSaving],
  );

  return (
    <GatewayConnectionModelsTable
      connectionName={connection.name}
      provider={connection.provider}
      models={models}
      modelApiFormats={modelApiFormats}
      customModels={connection.customModels}
      modelAccessStore={modelAccess.store}
      isSaving={isSaving}
      filters={filters}
      toolbarActions={toolbarActions}
      onToggleModel={modelAccess.toggleModel}
      onRemoveCustomModel={removeCustomModel}
      onSetModelsEnabled={setModelsEnabled}
    />
  );
}
