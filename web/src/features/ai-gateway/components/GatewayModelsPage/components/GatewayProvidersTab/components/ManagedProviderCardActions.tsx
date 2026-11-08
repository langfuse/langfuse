import { Pencil, RefreshCw, Trash2 } from "@langfuse/icons";

import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
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
      <IconButton
        icon={RefreshCw}
        label={`Retry validation for ${connection.name}`}
        size="sm"
        disabled={isRetrying}
        onClick={handleRetry}
      />
      <IconButton
        icon={Pencil}
        label={`Edit ${connection.name}`}
        size="sm"
        onClick={handleEdit}
      />
      <IconButton
        icon={Trash2}
        label={`Delete ${connection.name}`}
        size="sm"
        onClick={handleDelete}
      />
    </>
  );
}
