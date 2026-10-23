import { Stepper } from "@/src/components/design-system/Stepper/Stepper";
import { GATEWAY_SETUP } from "@/src/features/ai-gateway/components/GatewaySetupPage/constants/gatewaySetup";
import {
  TeamInviteForm,
  type TeamInviteFormProps,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/TeamInviteStep/components/TeamInviteForm/TeamInviteForm";
import type { getSetupStepStatus } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/fns/getSetupStepStatus";

export type TeamInviteStepProps = TeamInviteFormProps & {
  status: ReturnType<typeof getSetupStepStatus>;
};

export function TeamInviteStep({ status, ...formProps }: TeamInviteStepProps) {
  return (
    <Stepper
      number={3}
      title="Invite your team"
      size="sm"
      status={status}
      isCollapsible={false}
      compactBottomSpacing
      docsHref={GATEWAY_SETUP.docsUrl}
      description="Members can create their own gateway keys and use the models you enabled. New people join as Member."
    >
      {status === "current" ? <TeamInviteForm {...formProps} /> : null}
    </Stepper>
  );
}
