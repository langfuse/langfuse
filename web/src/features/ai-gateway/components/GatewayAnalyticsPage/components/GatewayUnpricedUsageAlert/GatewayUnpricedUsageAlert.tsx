import { Banner } from "@/src/components/design-system/Banner/Banner";
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
    <Banner
      variant="warning"
      title="Cost excludes unpriced usage"
      actions={[
        {
          text: "Add model prices",
          href: `/project/${encodeURIComponent(projectId)}/settings/models`,
        },
      ]}
    >
      {describeUnpricedUsage(usage)} used models without a price (
      <span className="ph-no-capture">{usage.models.join(", ")}</span>), so the
      cost widgets count them as $0.
    </Banner>
  );
}
