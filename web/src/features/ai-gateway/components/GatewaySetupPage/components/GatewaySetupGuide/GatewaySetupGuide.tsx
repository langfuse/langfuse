import { CredentialStep } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/CredentialStep";
import { IngestionStep } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/IngestionStep/IngestionStep";
import {
  TeamInviteStep,
  type TeamInviteStepProps,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/TeamInviteStep/TeamInviteStep";
import { getSetupStepStatus } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/fns/getSetupStepStatus";
import type {
  GatewayConfig,
  GatewayIngestionSettings,
  GatewayProject,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";
import type { GatewayConnection } from "@/src/features/ai-gateway/types/gatewayProvider";

export type GatewaySetupGuideProps = Omit<TeamInviteStepProps, "status"> & {
  /** The open step: 1 ingestion, 2 credential, 3 team. */
  activeStep: 1 | 2 | 3;
  config: GatewayConfig | null;
  projects: GatewayProject[];
  firstConnection: Pick<GatewayConnection, "provider"> | undefined;
  isSavingIngestion: boolean;
  onSaveIngestion: (settings: GatewayIngestionSettings) => Promise<unknown>;
  onAddCredential: () => void;
};

export function GatewaySetupGuide({
  activeStep,
  config,
  projects,
  firstConnection,
  isSavingIngestion,
  onSaveIngestion,
  onAddCredential,
  ...teamInviteProps
}: GatewaySetupGuideProps) {
  return (
    <div className="flex max-w-3xl flex-col">
      <IngestionStep
        status={getSetupStepStatus(1, activeStep)}
        config={config}
        projects={projects}
        isSaving={isSavingIngestion}
        onContinue={onSaveIngestion}
      />
      <CredentialStep
        status={getSetupStepStatus(2, activeStep)}
        firstConnection={firstConnection}
        onAddCredential={onAddCredential}
      />
      <TeamInviteStep
        status={getSetupStepStatus(3, activeStep)}
        {...teamInviteProps}
      />
    </div>
  );
}
