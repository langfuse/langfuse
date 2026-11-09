import { Button } from "@/src/components/design-system/Button/Button";
import { TeamInviteFailuresAlert } from "@/src/features/ai-gateway/components/TeamInviteFailuresAlert";
import { TeamInviteFields } from "@/src/features/ai-gateway/components/TeamInviteFields/TeamInviteFields";
import type { GatewayTeamInviteResult } from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";
import { useTeamNotifyForm } from "@/src/features/ai-gateway/hooks/useTeamNotifyForm";
import type { useTeamRecipients } from "@/src/features/ai-gateway/hooks/useTeamRecipients";

export type TeamInviteFormProps = {
  recipients: ReturnType<typeof useTeamRecipients>;
  isInviting: boolean;
  /** Resolves to null when the request failed and was already reported. */
  onInvite: (params: {
    emails: string[];
    notifyMembers: boolean;
  }) => Promise<GatewayTeamInviteResult | null>;
  onFinish: (outcome: { isSkipped: boolean }) => void;
};

export function TeamInviteForm({
  recipients,
  isInviting,
  onInvite,
  onFinish,
}: TeamInviteFormProps) {
  const form = useTeamNotifyForm(recipients);

  async function handleSend() {
    if (await form.send(onInvite)) onFinish({ isSkipped: false });
  }

  function handleSkip() {
    onFinish({ isSkipped: true });
  }

  return (
    <div className="flex flex-col gap-4 pt-1">
      <TeamInviteFields {...form.fieldsProps} />
      {form.failures.length > 0 ? (
        <TeamInviteFailuresAlert failures={form.failures} />
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          text={form.sendLabel}
          loading={isInviting}
          disabled={!form.canSend}
          onClick={handleSend}
        />
        <Button text="Skip for now" variant="ghost" onClick={handleSkip} />
      </div>
    </div>
  );
}
