import { Stepper } from "@/src/components/design-system/Stepper/Stepper";
import { GATEWAY_SETUP_DOCS_URL } from "@/src/features/ai-gateway/components/GatewaySetupPage/constants/gatewaySetupDocsUrl";
import { TeamInviteForm } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/TeamInviteStep/components/TeamInviteForm";
import type { getSetupStepStatus } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/fns/getSetupStepStatus";

export type TeamInviteStepProps = {
  status: ReturnType<typeof getSetupStepStatus>;
  organizationId: string;
  onFinish: () => void;
};

export function TeamInviteStep({
  status,
  organizationId,
  onFinish,
}: TeamInviteStepProps) {
  return (
    <Stepper
      number={3}
      title="Invite your team"
      size="sm"
      status={status}
      isCollapsible={false}
      docsHref={GATEWAY_SETUP_DOCS_URL}
      description="Members can create their own gateway keys and use the models you enabled. New people join as Member."
    >
      {status === "current" ? (
        <TeamInviteForm organizationId={organizationId} onFinish={onFinish} />
      ) : null}
    </Stepper>
  );
}
