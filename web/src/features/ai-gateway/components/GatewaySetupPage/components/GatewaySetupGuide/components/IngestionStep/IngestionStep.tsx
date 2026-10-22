import { Stepper } from "@/src/components/design-system/Stepper/Stepper";
import { IngestionStepForm } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/IngestionStep/components/IngestionStepForm";
import type { getSetupStepStatus } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/fns/getSetupStepStatus";
import { GATEWAY_SETUP_DOCS_URL } from "@/src/features/ai-gateway/components/GatewaySetupPage/constants/gatewaySetupDocsUrl";
import { describeGatewayIngestion } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/IngestionStep/fns/describeGatewayIngestion";
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
  const description =
    status === "complete" && config ? (
      <span className="ph-no-capture">
        {describeGatewayIngestion({ config, projects })}
      </span>
    ) : (
      "You can change this later."
    );

  return (
    <Stepper
      number={1}
      title="Choose how gateway traffic is recorded"
      size="sm"
      status={status}
      isCollapsible={false}
      docsHref={GATEWAY_SETUP_DOCS_URL}
      description={description}
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
