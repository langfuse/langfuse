import { Skeleton } from "@/src/components/ui/skeleton";
import { CredentialStep } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/CredentialStep";
import { IngestionStep } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/IngestionStep";
import { TeamInviteStep } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/TeamInviteStep/TeamInviteStep";
import { getSetupStepStatus } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/fns/getSetupStepStatus";
import { useGatewaySetupProgress } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/hooks/useGatewaySetupProgress";
import type {
  GatewayConfig,
  GatewayProject,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";

export type GatewaySetupGuideProps = {
  organizationId: string;
  config: GatewayConfig | null;
  projects: GatewayProject[];
  onFinish: () => void;
};

export function GatewaySetupGuide({
  organizationId,
  config,
  projects,
  onFinish,
}: GatewaySetupGuideProps) {
  const { activeStep, firstConnection, isPending } = useGatewaySetupProgress({
    organizationId,
    config,
  });

  if (isPending) {
    return <Skeleton className="h-64 w-full max-w-3xl" />;
  }

  return (
    <div className="flex max-w-3xl flex-col">
      <IngestionStep
        status={getSetupStepStatus(1, activeStep)}
        organizationId={organizationId}
        config={config}
        projects={projects}
      />
      <CredentialStep
        status={getSetupStepStatus(2, activeStep)}
        organizationId={organizationId}
        firstConnection={firstConnection}
      />
      <TeamInviteStep
        status={getSetupStepStatus(3, activeStep)}
        organizationId={organizationId}
        onFinish={onFinish}
      />
    </div>
  );
}
