import { useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { api, reportNonTrpcError } from "@/src/utils/api";

export function RevokeGatewayApiKeyDialog({
  organizationId,
  apiKeyId,
}: {
  organizationId: string;
  apiKeyId: string;
}) {
  const [open, setOpen] = useState(false);
  const utils = api.useUtils();
  const revoke = api.llmGateway.revokeApiKey.useMutation();

  const submit = async () => {
    try {
      await revoke.mutateAsync({ orgId: organizationId, id: apiKeyId });
      await utils.llmGateway.listApiKeys.invalidate({
        orgId: organizationId,
      });
      setOpen(false);
    } catch (error) {
      reportNonTrpcError(error, "llm-gateway-api-keys");
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button size="icon-xs" variant="ghost" aria-label="Revoke gateway key">
          <Trash2 className="size-4" />
        </Button>
      }
      title="Revoke gateway API key"
      description="Requests using this key will immediately be rejected. This action cannot be undone."
      confirmLabel="Revoke key"
      loading={revoke.isPending}
      onConfirm={submit}
    />
  );
}
