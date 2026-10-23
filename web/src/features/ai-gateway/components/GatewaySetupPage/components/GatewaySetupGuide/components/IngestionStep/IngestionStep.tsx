import { Button } from "@/src/components/design-system/Button/Button";
import { Stepper } from "@/src/components/design-system/Stepper/Stepper";
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
  const description =
    status === "complete" && config ? (
      <span className="ph-no-capture">
        {describeGatewayIngestion({ config, projects })}
      </span>
    ) : (
      <>
        You can change this later.{" "}
        <Button
          variant="text"
          size="sm"
          text="How ingestion modes work"
          href={GATEWAY_SETUP.docsUrl}
        />
      </>
    );

  return (
    <Stepper
      number={1}
      title="Choose how gateway traffic is recorded"
      size="sm"
      status={status}
      isCollapsible={false}
      description={description}
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
