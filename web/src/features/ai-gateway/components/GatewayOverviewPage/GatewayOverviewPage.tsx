import { Skeleton } from "@/src/components/ui/skeleton";
import { GatewayAnalyticsPage } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/GatewayAnalyticsPage";
import { GatewayNotDeployedNotice } from "@/src/features/ai-gateway/components/GatewayNotDeployedNotice/GatewayNotDeployedNotice";
import { GatewayOverviewSetup } from "@/src/features/ai-gateway/components/GatewayOverviewPage/components/GatewayOverviewSetup";
import type { GatewayProject } from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";

export type GatewayOverviewPageProps = {
  organizationId: string;
  projects: Array<GatewayProject & { deletedAt?: Date | string | null }>;
  /** From `useGatewayOverviewSetupVisit`, which also hides the page title. */
  isSetupOpen: boolean;
  onSetupFinish: () => void;
};

/** Analytics once the gateway is set up; until then managers get the setup guide. */
export function GatewayOverviewPage({
  organizationId,
  projects,
  isSetupOpen,
  onSetupFinish,
}: GatewayOverviewPageProps) {
  const access = useGatewaySettingsAccess(organizationId);

  if (access.showNotDeployedNotice) return <GatewayNotDeployedNotice />;
  if (!access.showManagement) {
    return <GatewayAnalyticsPage organizationId={organizationId} />;
  }
  if (access.isSetupStatusPending) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (!isSetupOpen) {
    return <GatewayAnalyticsPage organizationId={organizationId} />;
  }

  return (
    <GatewayOverviewSetup
      organizationId={organizationId}
      projects={projects.filter((project) => !project.deletedAt)}
      onFinish={onSetupFinish}
    />
  );
}
