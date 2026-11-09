import type { ReactNode } from "react";

import { GatewayAnalyticsFilter } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayAnalyticsFilter/GatewayAnalyticsFilter";
import { useGatewayAnalyticsFilters } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsFilters";
import { useGatewayAnalyticsLabels } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsLabels";
import { useGatewayAnalyticsView } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsView";

/** User and Gateway key filters next to the Overview title, as on the project Home page. */
export function GatewayAnalyticsTitleFilters({
  organizationId,
  canManageGateway,
}: {
  organizationId: string;
  canManageGateway: boolean;
}) {
  const { labels } = useGatewayAnalyticsLabels(organizationId);
  const { user, apiKey } = useGatewayAnalyticsFilters({
    labels,
    canFilterByUser: canManageGateway,
  });

  return (
    <DashboardOnly organizationId={organizationId}>
      {/* Option labels are member and API key names. */}
      <div className="ph-no-capture flex flex-wrap items-center gap-1">
        {canManageGateway ? (
          <GatewayAnalyticsFilter
            label="User"
            searchPlaceholder="Search users"
            {...user}
          />
        ) : null}
        <GatewayAnalyticsFilter
          label="Gateway key"
          searchPlaceholder="Search gateway keys"
          {...apiKey}
        />
      </div>
    </DashboardOnly>
  );
}

function DashboardOnly({
  organizationId,
  children,
}: {
  organizationId: string;
  children: ReactNode;
}) {
  const view = useGatewayAnalyticsView(organizationId);
  return view === "dashboard" || view === "loading" ? children : null;
}
