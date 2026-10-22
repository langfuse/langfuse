import { Stepper } from "@/src/components/design-system/Stepper/Stepper";
import { IngestionStepForm } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/IngestionStepForm";
import type { getSetupStepStatus } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/fns/getSetupStepStatus";
import { StepDocsLink } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/StepDocsLink";
import { describeGatewayIngestion } from "@/src/features/ai-gateway/components/GatewaySetupPage/fns/describeGatewayIngestion";
import type {
  GatewayConfig,
  GatewayProject,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";

export type IngestionStepProps = {
  status: ReturnType<typeof getSetupStepStatus>;
  organizationId: string;
  config: GatewayConfig | null;
  projects: GatewayProject[];
};

export function IngestionStep({
  status,
  organizationId,
  config,
  projects,
}: IngestionStepProps) {
  const summary =
    status === "complete" && config
      ? describeGatewayIngestion({ config, projects })
      : undefined;

  return (
    <Stepper
      number={1}
      title="Choose how gateway traffic is recorded"
      size="sm"
      status={status}
      isCollapsible={false}
      titleAction={<StepDocsLink />}
      description={summary}
    >
      {status === "current" ? (
        <IngestionStepForm
          organizationId={organizationId}
          config={config}
          projects={projects}
        />
      ) : null}
    </Stepper>
  );
}
