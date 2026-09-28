import { useEffect, useRef, useState } from "react";

import { reorderProviderIds } from "@/src/features/ai-gateway/fns/providerReorder/reorderProviderIds";
import {
  GatewayProvidersTable,
  type GatewayProvidersTableProps,
} from "./GatewayProvidersTable";

type Props = Omit<GatewayProvidersTableProps, "onMove"> & {
  onReorder: (sourceId: string, targetId: string) => Promise<boolean>;
};

export function ConnectedGatewayProvidersTable(props: Props) {
  const membershipKey = JSON.stringify(
    props.connections.map((connection) => connection.id).sort(),
  );
  return <OrderedGatewayProvidersTable key={membershipKey} {...props} />;
}

function OrderedGatewayProvidersTable({ onReorder, ...props }: Props) {
  const serverOrderKey = JSON.stringify(
    props.connections.map((connection) => connection.id),
  );
  const previousServerOrder = useRef(serverOrderKey);
  const expectedOrder = useRef<string[] | null>(null);
  const [orderedIds, setOrderedIds] = useState(() =>
    props.connections.map((connection) => connection.id),
  );
  useEffect(() => {
    if (previousServerOrder.current === serverOrderKey) return;
    previousServerOrder.current = serverOrderKey;
    const serverIds = props.connections.map((connection) => connection.id);
    if (JSON.stringify(expectedOrder.current) === serverOrderKey) {
      expectedOrder.current = null;
      return;
    }
    if (expectedOrder.current) return;
    setOrderedIds(serverIds);
  }, [serverOrderKey, props.connections]);
  const connections = props.connections.toSorted(
    (left, right) => orderedIds.indexOf(left.id) - orderedIds.indexOf(right.id),
  );

  const onMove = async (sourceId: string, targetId: string) => {
    const previousIds = orderedIds;
    const nextIds = reorderProviderIds(previousIds, sourceId, targetId);
    if (nextIds === previousIds) return;

    setOrderedIds(nextIds);
    expectedOrder.current = nextIds;
    if (!(await onReorder(sourceId, targetId))) {
      expectedOrder.current = null;
      setOrderedIds(previousIds);
    }
  };

  return (
    <GatewayProvidersTable
      {...props}
      connections={connections}
      onMove={onMove}
    />
  );
}
