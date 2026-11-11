import { Skeleton } from "@/src/components/ui/skeleton";
import { GatewayOverviewSetupLayout } from "@/src/features/ai-gateway/components/GatewayOverviewPage/components/GatewayOverviewSetupLayout/GatewayOverviewSetupLayout";
import { getGatewaySetupHeroProviders } from "@/src/features/ai-gateway/components/GatewayOverviewPage/fns/getGatewaySetupHeroProviders";
import { ConnectedGatewaySetupGuide } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ConnectedGatewaySetupGuide";
import { GatewayLoadError } from "@/src/features/ai-gateway/components/GatewayLoadError/GatewayLoadError";
import { useGatewayConfig } from "@/src/features/ai-gateway/components/GatewaySetupPage/hooks/useGatewayConfig";
import { useGatewaySetupProgress } from "@/src/features/ai-gateway/components/GatewaySetupPage/hooks/useGatewaySetupProgress";
import type {
  GatewayConfig,
  GatewayProject,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";

export type GatewayOverviewSetupProps = {
  organizationId: string;
  projects: GatewayProject[];
  onFinish: () => void;
};

/** Loads the setup state for the Overview setup view. */
export function GatewayOverviewSetup(props: GatewayOverviewSetupProps) {
  const gatewayConfig = useGatewayConfig(props.organizationId);

  if (gatewayConfig.status === "pending") {
    return (
      <div className="p-3">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (gatewayConfig.status === "error") {
    return (
      <div className="p-3">
        <GatewayLoadError kind="setup" onRetry={gatewayConfig.retry} />
      </div>
    );
  }

  return (
    <LoadedGatewayOverviewSetup {...props} config={gatewayConfig.config} />
  );
}

function LoadedGatewayOverviewSetup({
  organizationId,
  projects,
  config,
  onFinish,
}: GatewayOverviewSetupProps & { config: GatewayConfig | null }) {
  const { connectedProviders } = useGatewaySetupProgress({
    organizationId,
    config,
  });

  return (
    <GatewayOverviewSetupLayout
      providers={getGatewaySetupHeroProviders(connectedProviders)}
    >
      <ConnectedGatewaySetupGuide
        organizationId={organizationId}
        config={config}
        projects={projects}
        onFinish={onFinish}
      />
    </GatewayOverviewSetupLayout>
  );
}
