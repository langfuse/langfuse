import { RefreshCw } from "@langfuse/icons";

import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import type { useGatewayConnectionModels } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/hooks/useGatewayConnectionModels";

export function RefreshModelsButton({
  connectionModels,
}: {
  connectionModels: ReturnType<typeof useGatewayConnectionModels>;
}) {
  const { connectionQuery, isRetrying, retryDiscovery } = connectionModels;
  return (
    <Tooltip label="Refresh models for this connection">
      {({ getTriggerProps }) => (
        <IconButton
          {...getTriggerProps()}
          icon={RefreshCw}
          label="Refresh models for this connection"
          variant="outline"
          disabled={isRetrying || !connectionQuery.data}
          onClick={retryDiscovery}
        />
      )}
    </Tooltip>
  );
}
