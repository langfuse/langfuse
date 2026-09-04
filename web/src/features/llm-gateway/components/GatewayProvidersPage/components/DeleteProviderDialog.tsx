import { useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import type { GatewayConnection } from "@/src/features/llm-gateway/types/gatewayConnection";
import { api, reportNonTrpcError } from "@/src/utils/api";

export function DeleteProviderDialog({
  organizationId,
  connection,
}: {
  organizationId: string;
  connection: GatewayConnection;
}) {
  const [open, setOpen] = useState(false);
  const utils = api.useUtils();
  const remove = api.llmGateway.deleteConnection.useMutation();

  const deleteConnection = async () => {
    try {
      await remove.mutateAsync({
        orgId: organizationId,
        id: connection.id,
      });
      await utils.llmGateway.listConnections.invalidate({
        orgId: organizationId,
      });
      setOpen(false);
    } catch (error) {
      reportNonTrpcError(error, "llm-gateway-providers");
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button size="icon-xs" variant="ghost" aria-label="Delete credential">
          <Trash2 className="size-4" />
        </Button>
      }
      title="Delete provider credential"
      description={`Delete “${connection.name}”? Requests will immediately stop using it.`}
      confirmLabel="Delete credential"
      loading={remove.isPending}
      onConfirm={deleteConnection}
    />
  );
}
