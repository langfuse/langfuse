import {
  Stepper,
  type RichDescription,
} from "@/src/components/design-system/Stepper/Stepper";
import { IngestionStepForm } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/IngestionStep/components/IngestionStepForm";
import type { getSetupStepStatus } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/fns/getSetupStepStatus";
import { GATEWAY_SETUP } from "@/src/features/ai-gateway/components/GatewaySetupPage/constants/gatewaySetup";
import { describeGatewayIngestion } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/IngestionStep/fns/describeGatewayIngestion";
import type {
  GatewayConfig,
  GatewayIngestionSettings,
  GatewayProject,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";

export type IngestionStepProps = {
  status: ReturnType<typeof getSetupStepStatus>;
  config: GatewayConfig | null;
  projects: GatewayProject[];
  isSaving: boolean;
  onContinue: (settings: GatewayIngestionSettings) => Promise<unknown>;
};

export function IngestionStep({
  status,
  config,
  projects,
  isSaving,
  onContinue,
}: IngestionStepProps) {
  const recorded = status === "complete" && config !== null;
  const description: RichDescription = recorded
    ? describeGatewayIngestion({ config, projects })
    : [
        { type: "text", text: "You can change this later. " },
        {
          type: "link",
          text: "How ingestion modes work",
          href: GATEWAY_SETUP.docsUrl,
        },
      ];

  return (
    <Stepper
      number={1}
      title="Choose how gateway traffic is recorded"
      status={status}
      isCollapsible={false}
      description={description}
      descriptionNoCapture={recorded}
    >
      {status === "current" ? (
        <IngestionStepForm
          config={config}
          projects={projects}
          isSaving={isSaving}
          onContinue={onContinue}
        />
      ) : null}
    </Stepper>
  );
}
