import { useState } from "react";

import { Skeleton } from "@/src/components/ui/skeleton";
import { GatewayAnalyticsPage } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/GatewayAnalyticsPage";
import { GatewayNotDeployedNotice } from "@/src/features/ai-gateway/components/GatewayNotDeployedNotice/GatewayNotDeployedNotice";
import { GatewayOverviewSetup } from "@/src/features/ai-gateway/components/GatewayOverviewPage/components/GatewayOverviewSetup";
import type { GatewayProject } from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";

export type GatewayOverviewPageProps = {
  organizationId: string;
  projects: Array<GatewayProject & { deletedAt?: Date | string | null }>;
};

/** Analytics once the gateway is set up; until then managers get the setup guide. */
export function GatewayOverviewPage({
  organizationId,
  projects,
}: GatewayOverviewPageProps) {
  const access = useGatewaySettingsAccess(organizationId);

  if (access.showNotDeployedNotice) return <GatewayNotDeployedNotice />;
  if (!access.showManagement) {
    return <GatewayAnalyticsPage organizationId={organizationId} />;
  }
  if (access.isSetupStatusPending) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <GatewayOverviewForManager
      organizationId={organizationId}
      projects={projects.filter((project) => !project.deletedAt)}
      needsSetup={access.isIngestionConfigured === false}
    />
  );
}

/**
 * Whether setup shows is decided on mount and kept for the visit, so saving
 * step 1 does not swap the guide for analytics mid-setup.
 */
function GatewayOverviewForManager({
  organizationId,
  projects,
  needsSetup,
}: GatewayOverviewForManagerProps) {
  const [isSetupOpen, setIsSetupOpen] = useState(needsSetup);

  function handleSetupFinish() {
    setIsSetupOpen(false);
  }

  if (!isSetupOpen) {
    return <GatewayAnalyticsPage organizationId={organizationId} />;
  }

  return (
    <GatewayOverviewSetup
      organizationId={organizationId}
      projects={projects}
      onFinish={handleSetupFinish}
    />
  );
}

type GatewayOverviewForManagerProps = {
  organizationId: string;
  projects: GatewayProject[];
  needsSetup: boolean;
};
