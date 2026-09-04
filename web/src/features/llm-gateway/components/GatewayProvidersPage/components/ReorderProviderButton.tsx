import { ArrowDown, ArrowUp } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import type { GatewayConnection } from "@/src/features/llm-gateway/types/gatewayConnection";
import { api, reportNonTrpcError } from "@/src/utils/api";

export function ReorderProviderButton({
  organizationId,
  connections,
  index,
  direction,
  canReorder,
}: {
  organizationId: string;
  connections: GatewayConnection[];
  index: number;
  direction: "up" | "down";
  canReorder: boolean;
}) {
  const utils = api.useUtils();
  const reorder = api.llmGateway.reorderConnections.useMutation();
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  const disabled =
    !canReorder ||
    reorder.isPending ||
    targetIndex < 0 ||
    targetIndex >= connections.length;
  const Icon = direction === "up" ? ArrowUp : ArrowDown;

  const move = async () => {
    const connectionIds = connections.map((connection) => connection.id);
    [connectionIds[index], connectionIds[targetIndex]] = [
      connectionIds[targetIndex],
      connectionIds[index],
    ];
    try {
      await reorder.mutateAsync({ orgId: organizationId, connectionIds });
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
      disabled={disabled}
      aria-label={`Move credential ${direction}`}
      onClick={move}
    >
      <Icon className="size-4" />
    </Button>
  );
}
