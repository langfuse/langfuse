import { Stepper } from "@/src/components/design-system/Stepper/Stepper";
import { StepDocsLink } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/StepDocsLink";
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
      titleAction={<StepDocsLink />}
    >
      {status === "current" ? (
        <TeamInviteForm organizationId={organizationId} onFinish={onFinish} />
      ) : null}
    </Stepper>
  );
}
