import { RefreshCw, Trash2 } from "@langfuse/icons";

import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Skeleton, SkeletonGroup } from "@/src/components/ui/skeleton";
import { GatewayProviderMark } from "@/src/features/ai-gateway/components/GatewayProviderMark";
import { ConnectionModelsLoadError } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsLoadError";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import { describeGatewayModelAccess } from "@/src/features/ai-gateway/fns/describeGatewayModelAccess";
import type { GatewayConnection } from "@/src/features/ai-gateway/types/gatewayProvider";

export type ConnectionSummaryProps = {
  connection: GatewayConnection | undefined;
  isDeleting: boolean;
  isError: boolean;
  isRetrying: boolean;
  onDelete: (connection: GatewayConnection) => Promise<void>;
  onRefresh: () => void;
  onRetry: () => void;
};

export function ConnectionSummary({
  connection,
  isDeleting,
  isError,
  isRetrying,
  onDelete,
  onRefresh,
  onRetry,
}: ConnectionSummaryProps) {
  if (!connection) {
    if (isError) {
      return <ConnectionModelsLoadError kind="connection" retry={onRetry} />;
    }
    return (
      <>
        <ConnectionDetailsSkeleton />
        <span className="sr-only">Loading provider credential</span>
      </>
    );
  }

  const access = describeGatewayModelAccess(
    connection.allowedModels,
    connection.provider,
  );
  const deleteConnection = () => onDelete(connection);

  return (
    <>
      <ConfirmationDialogController
        title="Delete provider credential"
        text={`Delete “${connection.name}”? Requests will immediately stop using it.`}
        confirmLabel="Delete credential"
        variant="destructive"
        loading={isDeleting}
        onConfirm={deleteConnection}
      >
        {({ openDialog }) => (
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <GatewayProviderMark provider={connection.provider} />
              <h2
                className="truncate text-lg font-bold"
                title={connection.name}
              >
                {connection.name}
                <span className="sr-only">
                  {" "}
                  ({providerLabels[connection.provider]})
                </span>
              </h2>
            </div>
            <div className="flex shrink-0 -translate-y-px items-center gap-2">
              <IconButton
                icon={RefreshCw}
                label="Refresh provider models"
                variant="outline"
                disabled={isRetrying || isDeleting}
                onClick={onRefresh}
              />
              <IconButton
                icon={Trash2}
                label="Delete provider credential"
                variant="outlineDestructive"
                disabled={isDeleting}
                onClick={openDialog}
              />
            </div>
          </div>
        )}
      </ConfirmationDialogController>
      <p className="text-muted-foreground text-sm">{access}</p>
    </>
  );
}

function ConnectionDetailsSkeleton() {
  return (
    <SkeletonGroup className="flex flex-col gap-3">
      <Skeleton className="h-7 w-52" />
      <Skeleton className="h-10 w-full max-w-2xl" />
    </SkeletonGroup>
  );
}
