import { AlertTriangle } from "@langfuse/icons";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { describeUnpricedUsage } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/fns/describeUnpricedUsage";
import type { GatewayUnpricedUsage } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/fns/summarizeUnpricedUsage";

export type GatewayUnpricedCostBadgeProps = {
  usage: GatewayUnpricedUsage;
};

export function GatewayUnpricedCostBadge({
  usage,
}: GatewayUnpricedCostBadgeProps) {
  return (
    <Tooltip
      label={`Excludes ${describeUnpricedUsage(usage)} to models without a price.`}
    >
      {({ getTriggerProps }) => (
        <span
          {...getTriggerProps()}
          tabIndex={0}
          className="focus-visible:ring-ring h-fit shrink-0 rounded-sm focus-visible:ring-2 focus-visible:outline-hidden"
        >
          <Badge
            size="sm"
            color="yellow"
            leadingIcon={AlertTriangle}
            interactive
            text="Excludes unpriced"
          />
        </span>
      )}
    </Tooltip>
  );
}
