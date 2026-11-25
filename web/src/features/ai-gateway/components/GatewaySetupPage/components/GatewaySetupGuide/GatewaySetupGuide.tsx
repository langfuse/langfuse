import {
  ApiKeyStep,
  type ApiKeyStepProps,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/ApiKeyStep";
import {
  BudgetStep,
  type BudgetStepProps,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/BudgetStep";
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

export type GatewaySetupGuideProps = Omit<TeamInviteStepProps, "status"> &
  Omit<ApiKeyStepProps, "status"> & {
    /** The open step: 1 ingestion, 2 credential, 3 budgets, 4 team, 5 own key. */
    activeStep: 1 | 2 | 3 | 4 | 5;
    config: GatewayConfig | null;
    projects: GatewayProject[];
    firstConnection: Pick<GatewayConnection, "provider"> | undefined;
    isSavingIngestion: boolean;
    onSaveIngestion: (settings: GatewayIngestionSettings) => Promise<unknown>;
    onAddCredential: () => void;
    budgetStep: Omit<BudgetStepProps, "status">;
  };

export function GatewaySetupGuide({
  activeStep,
  config,
  projects,
  firstConnection,
  isSavingIngestion,
  onSaveIngestion,
  onAddCredential,
  budgetStep,
  onCreateKey,
  onSkipKey,
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
      <BudgetStep status={getSetupStepStatus(3, activeStep)} {...budgetStep} />
      <TeamInviteStep
        status={getSetupStepStatus(4, activeStep)}
        {...teamInviteProps}
      />
      <ApiKeyStep
        status={getSetupStepStatus(5, activeStep)}
        onCreateKey={onCreateKey}
        onSkipKey={onSkipKey}
      />
    </div>
  );
}
