import type { ComponentProps } from "react";

import { ConnectedGatewayOrganizationBudgetsTable } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayOrganizationBudgetsTabContent/components/GatewayOrganizationBudgetsTable/ConnectedGatewayOrganizationBudgetsTable";
import { GatewayOrganizationSpendChart } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayOrganizationBudgetsTabContent/components/GatewayOrganizationSpendChart/GatewayOrganizationSpendChart";

type GatewayOrganizationBudgetsTabContentProps = {
  organizationId: string;
  /** Null while spend cannot be queried; the chart is then left out. */
  chart: ComponentProps<typeof GatewayOrganizationSpendChart> | null;
};

/** The organization's total spend and its own budgets, which cap it. */
export function GatewayOrganizationBudgetsTabContent({
  organizationId,
  chart,
}: GatewayOrganizationBudgetsTabContentProps) {
  return (
    <>
      {chart && <GatewayOrganizationSpendChart {...chart} />}
      <p className="text-muted-foreground text-sm">
        Caps total gateway spend in this organization, across all members and
        keys. Key and user budgets still apply; whichever is reached first
        blocks the request.
      </p>
      <ConnectedGatewayOrganizationBudgetsTable
        organizationId={organizationId}
      />
    </>
  );
}
