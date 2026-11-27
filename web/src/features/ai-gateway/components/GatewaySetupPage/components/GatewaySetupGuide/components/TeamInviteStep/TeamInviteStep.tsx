import {
  Stepper,
  type RichDescription,
} from "@/src/components/design-system/Stepper/Stepper";
import {
  TeamInviteForm,
  type TeamInviteFormProps,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/TeamInviteStep/components/TeamInviteForm/TeamInviteForm";
import { TEAM_NOTIFY_COPY } from "@/src/features/ai-gateway/constants/gatewayTeamInvites";
import type { getSetupStepStatus } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/fns/getSetupStepStatus";

export type TeamInviteStepProps = TeamInviteFormProps & {
  status: ReturnType<typeof getSetupStepStatus>;
};

function teamInviteDescription(
  status: TeamInviteStepProps["status"],
): RichDescription {
  if (status !== "current") return TEAM_NOTIFY_COPY.description;
  return [
    { type: "text", text: `${TEAM_NOTIFY_COPY.description} ` },
    { type: "link", text: "About roles", href: TEAM_NOTIFY_COPY.rolesDocsUrl },
  ];
}

export function TeamInviteStep({ status, ...formProps }: TeamInviteStepProps) {
  return (
    <Stepper
      number={4}
      title={TEAM_NOTIFY_COPY.title}
      status={status}
      isCollapsible={false}
      description={teamInviteDescription(status)}
    >
      {status === "current" ? <TeamInviteForm {...formProps} /> : null}
    </Stepper>
  );
}
