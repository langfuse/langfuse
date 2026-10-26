import { useEffect, useRef } from "react";

import { Skeleton } from "@/src/components/ui/skeleton";
import { GatewaySetupGuide } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/GatewaySetupGuide";
import { ProviderDialogController } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/ProviderDialogController";
import { useGatewaySetupProgress } from "@/src/features/ai-gateway/components/GatewaySetupPage/hooks/useGatewaySetupProgress";
import { useGatewayTeamInvite } from "@/src/features/ai-gateway/components/GatewaySetupPage/hooks/useGatewayTeamInvite";
import { useSaveGatewayIngestion } from "@/src/features/ai-gateway/components/GatewaySetupPage/hooks/useSaveGatewayIngestion";
import type {
  GatewayConfig,
  GatewayIngestionSettings,
  GatewayProject,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

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
  const capture = usePostHogClientCapture();
  const { activeStep, firstConnection, isPending } = useGatewaySetupProgress({
    organizationId,
    config,
  });
  const { saveIngestion, isSaving } = useSaveGatewayIngestion(
    organizationId,
    "setup_guide",
  );
  const { notifiableMembers, inviteTeam, isInviting } =
    useGatewayTeamInvite(organizationId);

  // Funnel entry for the setup steps; the ref keeps it to one event per visit.
  const hasCapturedViewRef = useRef(false);
  useEffect(() => {
    if (hasCapturedViewRef.current) return;
    hasCapturedViewRef.current = true;
    capture("ai_gateway:setup_guide_viewed", { orgId: organizationId });
  }, [capture, organizationId]);

  async function handleSaveIngestion(settings: GatewayIngestionSettings) {
    const isSaved = await saveIngestion(settings);
    if (isSaved) {
      capture("ai_gateway:setup_step_completed", {
        orgId: organizationId,
        step: "ingestion",
        stepNumber: 1,
        ingestionMode: settings.ingestionMode,
      });
    }
    return isSaved;
  }

  function handleCredentialCreated({
    provider,
  }: {
    provider: GatewayProvider;
  }) {
    capture("ai_gateway:setup_step_completed", {
      orgId: organizationId,
      step: "credential",
      stepNumber: 2,
      provider,
    });
  }

  function handleFinish({ isSkipped }: { isSkipped: boolean }) {
    capture("ai_gateway:setup_step_completed", {
      orgId: organizationId,
      step: "team_invite",
      stepNumber: 3,
      isSkipped,
    });
    onFinish();
  }

  if (isPending) {
    return <Skeleton className="h-64 w-full max-w-3xl" />;
  }

  return (
    <ProviderDialogController
      organizationId={organizationId}
      surface="setup_guide"
      onAfterCreate={handleCredentialCreated}
    >
      {({ openAddDialog }) => (
        <GatewaySetupGuide
          activeStep={activeStep}
          config={config}
          projects={projects}
          firstConnection={firstConnection}
          isSavingIngestion={isSaving}
          onSaveIngestion={handleSaveIngestion}
          onAddCredential={openAddDialog}
          notifiableMembers={notifiableMembers}
          isInviting={isInviting}
          onInvite={inviteTeam}
          onFinish={handleFinish}
        />
      )}
    </ProviderDialogController>
  );
}
