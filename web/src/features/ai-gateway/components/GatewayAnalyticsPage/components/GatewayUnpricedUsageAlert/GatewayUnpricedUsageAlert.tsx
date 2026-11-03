import { AlertTriangle } from "@langfuse/icons";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { describeUnpricedUsage } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/fns/describeUnpricedUsage";
import type { GatewayUnpricedUsage } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/fns/summarizeUnpricedUsage";

export type GatewayUnpricedUsageAlertProps = {
  projectId: string;
  usage: GatewayUnpricedUsage;
};

export function GatewayUnpricedUsageAlert({
  projectId,
  usage,
}: GatewayUnpricedUsageAlertProps) {
  return (
    <Alert variant="warning" size="sm" icon={AlertTriangle}>
      <Alert.Title>Cost excludes unpriced usage</Alert.Title>
      <Alert.Description>
        <p>
          {describeUnpricedUsage(usage)} used models without a price (
          <span className="ph-no-capture">{usage.models.join(", ")}</span>), so
          the cost widgets count them as $0.{" "}
          <Button
            variant="text"
            text="Add model prices"
            href={`/project/${encodeURIComponent(projectId)}/settings/models`}
          />
        </p>
      </Alert.Description>
    </Alert>
  );
}
