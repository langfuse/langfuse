import { Banner } from "@/src/components/design-system/Banner/Banner";
import { describeUnpricedUsage } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/fns/describeUnpricedUsage";
import type { GatewayUnpricedUsage } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/fns/summarizeUnpricedUsage";
import { modelsSettingsHref } from "@/src/features/models/modelOwner";

export type GatewayUnpricedUsageAlertProps = {
  organizationId: string;
  /** Only for viewers who can add organization model definitions. */
  canAddModelPrices: boolean;
  usage: GatewayUnpricedUsage;
};

export function GatewayUnpricedUsageAlert({
  organizationId,
  canAddModelPrices,
  usage,
}: GatewayUnpricedUsageAlertProps) {
  return (
    <Banner
      variant="warning"
      title="Cost excludes unpriced usage"
      actions={
        canAddModelPrices
          ? [
              {
                text: "Add model prices",
                href: modelsSettingsHref({
                  scope: "organization",
                  organizationId,
                }),
              },
            ]
          : undefined
      }
    >
      {describeUnpricedUsage(usage)} used models without a price (
      <span className="ph-no-capture">{usage.models.join(", ")}</span>), so the
      cost widgets count them as $0.
    </Banner>
  );
}
