import { Pencil, RefreshCw, Trash2 } from "@langfuse/icons";

import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import type { GatewayConnection } from "@/src/features/ai-gateway/types/gatewayProvider";

export type ManagedProviderCardActionsProps = {
  connection: GatewayConnection;
  isRetrying: boolean;
  onEdit: (connection: GatewayConnection) => void;
  onRetry: (connection: GatewayConnection) => void;
  onDelete: (connection: GatewayConnection) => void;
};

export function ManagedProviderCardActions({
  connection,
  isRetrying,
  onEdit,
  onRetry,
  onDelete,
}: ManagedProviderCardActionsProps) {
  const handleEdit = () => onEdit(connection);
  const handleRetry = () => onRetry(connection);
  const handleDelete = () => onDelete(connection);

  return (
    <>
      <Tooltip label="Refresh models">
        {({ getTriggerProps }) => (
          <IconButton
            {...getTriggerProps()}
            icon={RefreshCw}
            label={`Refresh models for ${connection.name}`}
            size="sm"
            disabled={isRetrying}
            onClick={handleRetry}
          />
        )}
      </Tooltip>
      <Tooltip label="Edit connection">
        {({ getTriggerProps }) => (
          <IconButton
            {...getTriggerProps()}
            icon={Pencil}
            label={`Edit ${connection.name}`}
            size="sm"
            onClick={handleEdit}
          />
        )}
      </Tooltip>
      <Tooltip label="Delete connection">
        {({ getTriggerProps }) => (
          <IconButton
            {...getTriggerProps()}
            icon={Trash2}
            label={`Delete ${connection.name}`}
            size="sm"
            onClick={handleDelete}
          />
        )}
      </Tooltip>
    </>
  );
}
