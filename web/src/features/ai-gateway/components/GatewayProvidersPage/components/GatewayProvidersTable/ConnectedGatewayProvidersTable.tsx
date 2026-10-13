import { useState } from "react";

import { reorderProviderIds } from "@/src/features/ai-gateway/fns/providerReorder/reorderProviderIds";
import {
  GatewayProvidersTable,
  type GatewayProvidersTableProps,
} from "./GatewayProvidersTable";

type Props = Omit<GatewayProvidersTableProps, "onMove"> & {
  onReorder: (sourceId: string, targetId: string) => Promise<boolean>;
};

export function ConnectedGatewayProvidersTable(props: Props) {
  const { onReorder, ...tableProps } = props;
  const serverOrderKey = JSON.stringify(
    props.connections.map((connection) => connection.id),
  );
  const [optimisticOrder, setOptimisticOrder] = useState<{
    base: string;
    ids: string[];
  } | null>(null);
  const serverIds = props.connections.map((connection) => connection.id);
  const sameMembers =
    optimisticOrder &&
    JSON.stringify([...optimisticOrder.ids].sort()) ===
      JSON.stringify([...serverIds].sort());
  const orderedIds =
    optimisticOrder &&
    sameMembers &&
    (serverOrderKey === optimisticOrder.base ||
      serverOrderKey === JSON.stringify(optimisticOrder.ids))
      ? optimisticOrder.ids
      : serverIds;
  const connections = props.connections.toSorted(
    (left, right) => orderedIds.indexOf(left.id) - orderedIds.indexOf(right.id),
  );

  const onMove = async (sourceId: string, targetId: string) => {
    const previousIds = orderedIds;
    const nextIds = reorderProviderIds(previousIds, sourceId, targetId);
    if (nextIds === previousIds) {
      if (sourceId !== targetId) await onReorder(sourceId, targetId);
      return;
    }

    setOptimisticOrder({ base: serverOrderKey, ids: nextIds });
    if (!(await onReorder(sourceId, targetId))) {
      setOptimisticOrder(null);
    }
  };

  return (
    <GatewayProvidersTable
      {...tableProps}
      connections={connections}
      onMove={onMove}
    />
  );
}
