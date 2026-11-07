import { Skeleton } from "@/src/components/ui/skeleton";
import { GatewayNotSetUpNotice } from "@/src/features/ai-gateway/components/GatewayNotSetUpNotice/GatewayNotSetUpNotice";
import { GatewayConfigLoadError } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewayConfigLoadError/GatewayConfigLoadError";
import { useGatewayConfig } from "@/src/features/ai-gateway/components/GatewaySetupPage/hooks/useGatewayConfig";
import type { GatewayProject } from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";
import { GATEWAY_MODELS_TABS } from "@/src/features/ai-gateway/constants/gatewayModelsTabs";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import { ManagedModelsTab } from "./components/GatewayModelsTab/ManagedModelsTab";
import { ReadOnlyModelsTab } from "./components/GatewayModelsTab/ReadOnlyModelsTab";
import { ManagedProvidersTab } from "./components/GatewayProvidersTab/ManagedProvidersTab";
import { ReadOnlyProvidersTab } from "./components/GatewayProvidersTab/ReadOnlyProvidersTab";
import { useGatewayModelsPageState } from "./hooks/useGatewayModelsPageState";

export type GatewayModelsPageProps = {
  organizationId: string;
  projects: Array<GatewayProject & { deletedAt?: Date | string | null }>;
};

/** Providers and their models; members who cannot manage the gateway get a read-only view. */
export function GatewayModelsPage({
  organizationId,
  projects,
}: GatewayModelsPageProps) {
  const { canManageGateway, isIngestionConfigured, isSetupStatusPending } =
    useGatewaySettingsAccess(organizationId);

  if (isSetupStatusPending) return <ModelsPageSkeleton />;
  if (canManageGateway) {
    return (
      <ManagedModelsPage
        organizationId={organizationId}
        projects={projects.filter((project) => !project.deletedAt)}
      />
    );
  }
  // Managers are sent to the setup guide by the page route instead.
  if (isIngestionConfigured === false) return <GatewayNotSetUpNotice />;
  return <ReadOnlyModelsPage organizationId={organizationId} />;
}

function ManagedModelsPage({
  organizationId,
  projects,
}: {
  organizationId: string;
  projects: GatewayProject[];
}) {
  const { activeTab, connectionId } = useGatewayModelsPageState();
  const gatewayConfig = useGatewayConfig(organizationId);

  if (activeTab === GATEWAY_MODELS_TABS.models) {
    return (
      <ManagedModelsTab
        organizationId={organizationId}
        connectionId={connectionId}
      />
    );
  }
  if (gatewayConfig.status === "pending") return <ModelsPageSkeleton />;
  if (gatewayConfig.status === "error") {
    return <GatewayConfigLoadError onRetry={gatewayConfig.retry} />;
  }
  return (
    <ManagedProvidersTab
      organizationId={organizationId}
      config={gatewayConfig.config}
      projects={projects}
    />
  );
}

function ReadOnlyModelsPage({ organizationId }: { organizationId: string }) {
  const { activeTab, connectionId } = useGatewayModelsPageState();

  return activeTab === GATEWAY_MODELS_TABS.models ? (
    <ReadOnlyModelsTab
      organizationId={organizationId}
      connectionId={connectionId}
    />
  ) : (
    <ReadOnlyProvidersTab organizationId={organizationId} />
  );
}

function ModelsPageSkeleton() {
  return (
    <div className="flex flex-col gap-4" data-testid="gateway-models-loading">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
