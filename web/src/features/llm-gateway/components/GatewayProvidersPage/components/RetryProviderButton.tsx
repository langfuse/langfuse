import { RefreshCw } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { api, reportNonTrpcError } from "@/src/utils/api";

export function RetryProviderButton({
  organizationId,
  connectionId,
  onModelsLoaded,
}: {
  organizationId: string;
  connectionId: string;
  onModelsLoaded: (count: number) => void;
}) {
  const utils = api.useUtils();
  const retry = api.llmGateway.retryConnection.useMutation();

  const retryConnection = async () => {
    try {
      const result = await retry.mutateAsync({
        orgId: organizationId,
        id: connectionId,
      });
      if (result.success) onModelsLoaded(result.models.length);
      await utils.llmGateway.listConnections.invalidate({
        orgId: organizationId,
      });
    } catch (error) {
      reportNonTrpcError(error, "llm-gateway-providers");
    }
  };

  return (
    <Button
      size="icon-xs"
      variant="ghost"
      loading={retry.isPending}
      aria-label="Retry provider validation"
      onClick={retryConnection}
    >
      <RefreshCw className="size-4" />
    </Button>
  );
}
