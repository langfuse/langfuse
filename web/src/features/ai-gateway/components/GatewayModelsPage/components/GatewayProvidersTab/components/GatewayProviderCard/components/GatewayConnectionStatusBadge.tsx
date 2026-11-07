import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { StatusBadge } from "@/src/components/ui/StatusBadge/StatusBadge";
import type { GatewayConnection } from "@/src/features/ai-gateway/types/gatewayProvider";

const connectionStatus = {
  ENABLED: "active",
  ERROR: "error",
  DISABLED: "disabled",
} as const satisfies Record<GatewayConnection["status"], string>;

/** Model discovery marks a connection as errored only when the provider rejects its credential. */
const connectionErrorReason =
  "The provider rejected this credential. Update the credential or retry validation.";

export type GatewayConnectionStatusBadgeProps = {
  status: GatewayConnection["status"];
};

export function GatewayConnectionStatusBadge({
  status,
}: GatewayConnectionStatusBadgeProps) {
  const badge = <StatusBadge type={connectionStatus[status]} isLive={false} />;
  if (status !== "ERROR") return badge;
  return (
    <Tooltip label={connectionErrorReason}>
      {({ getTriggerProps }) => (
        <span
          {...getTriggerProps()}
          tabIndex={0}
          className="focus-visible:ring-ring inline-flex rounded-sm focus-visible:ring-2 focus-visible:outline-hidden"
        >
          {badge}
        </span>
      )}
    </Tooltip>
  );
}
