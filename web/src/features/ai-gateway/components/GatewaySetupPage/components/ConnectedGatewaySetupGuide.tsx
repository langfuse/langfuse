import { Skeleton } from "@/src/components/ui/skeleton";
import { GatewaySetupGuide } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/GatewaySetupGuide";
import { ProviderDialogController } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/ProviderDialogController";
import { useGatewaySetupProgress } from "@/src/features/ai-gateway/components/GatewaySetupPage/hooks/useGatewaySetupProgress";
import { useGatewayTeamInvite } from "@/src/features/ai-gateway/components/GatewaySetupPage/hooks/useGatewayTeamInvite";
import { useSaveGatewayIngestion } from "@/src/features/ai-gateway/components/GatewaySetupPage/hooks/useSaveGatewayIngestion";
import type {
  GatewayConfig,
  GatewayProject,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";

export type ConnectedGatewaySetupGuideProps = {
  organizationId: string;
  config: GatewayConfig | null;
  projects: GatewayProject[];
  onFinish: () => void;
};

export function ConnectedGatewaySetupGuide({
  organizationId,
  config,
  projects,
  onFinish,
}: ConnectedGatewaySetupGuideProps) {
  const { activeStep, firstConnection, isPending } = useGatewaySetupProgress({
    organizationId,
    config,
  });
  const { saveIngestion, isSaving } = useSaveGatewayIngestion(organizationId);
  const { notifiableMembers, inviteTeam, isInviting } =
    useGatewayTeamInvite(organizationId);

  if (isPending) {
    return <Skeleton className="h-64 w-full max-w-3xl" />;
  }

  return (
    <ProviderDialogController organizationId={organizationId}>
      {({ openAddDialog }) => (
        <GatewaySetupGuide
          activeStep={activeStep}
          config={config}
          projects={projects}
          firstConnection={firstConnection}
          isSavingIngestion={isSaving}
          onSaveIngestion={saveIngestion}
          onAddCredential={openAddDialog}
          notifiableMembers={notifiableMembers}
          isInviting={isInviting}
          onInvite={inviteTeam}
          onFinish={onFinish}
        />
      )}
    </ProviderDialogController>
  );
}
