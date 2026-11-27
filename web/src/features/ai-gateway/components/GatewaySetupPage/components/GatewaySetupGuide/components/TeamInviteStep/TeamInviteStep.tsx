import { Stepper } from "@/src/components/design-system/Stepper/Stepper";
import {
  TeamInviteForm,
  type TeamInviteFormProps,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/TeamInviteStep/components/TeamInviteForm/TeamInviteForm";
import { TEAM_NOTIFY_COPY } from "@/src/features/ai-gateway/constants/gatewayTeamInvites";
import type { getSetupStepStatus } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/fns/getSetupStepStatus";

export type TeamInviteStepProps = TeamInviteFormProps & {
  status: ReturnType<typeof getSetupStepStatus>;
};

export function TeamInviteStep({ status, ...formProps }: TeamInviteStepProps) {
  return (
    <Stepper
      number={4}
      title={TEAM_NOTIFY_COPY.title}
      status={status}
      isCollapsible={false}
      description={TEAM_NOTIFY_COPY.description}
      descriptionLink={
        status === "current"
          ? { label: "About roles", href: TEAM_NOTIFY_COPY.rolesDocsUrl }
          : undefined
      }
    >
      {status === "current" ? <TeamInviteForm {...formProps} /> : null}
    </Stepper>
  );
}
