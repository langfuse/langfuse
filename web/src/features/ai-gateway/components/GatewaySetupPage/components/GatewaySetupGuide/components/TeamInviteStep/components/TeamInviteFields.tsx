import { useId } from "react";
import { Mail } from "@langfuse/icons";

import { EmailTagInput } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/TeamInviteStep/components/EmailTagInput/EmailTagInput";
import {
  NotifyMembersToggle,
  type NotifyMembersToggleProps,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/TeamInviteStep/components/NotifyMembersToggle";

export type TeamInviteFieldsProps = {
  emails: string[];
  onEmailsChange: (emails: string[]) => void;
  /** Omit when there is nobody to notify or email is not configured. */
  notifyMembers?: NotifyMembersToggleProps;
};

/** One framed field: invitee emails on top, the member announcement below. */
export function TeamInviteFields({
  emails,
  onEmailsChange,
  notifyMembers,
}: TeamInviteFieldsProps) {
  const inputId = useId();
  const hintId = useId();

  return (
    <div className="has-[input:focus]:border-ring flex max-w-xl flex-col rounded-md border">
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <Mail
          size="base"
          color="tertiary"
          aria-hidden
          __rawClassName="mt-1 shrink-0"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <EmailTagInput
            id={inputId}
            value={emails}
            onChange={onEmailsChange}
            aria-describedby={hintId}
          />
          <p id={hintId} className="text-muted-foreground text-xs">
            Separate with a comma or Enter. They join as Member.
          </p>
        </div>
      </div>
      {notifyMembers ? (
        <div className="border-t px-3 py-2.5">
          <NotifyMembersToggle {...notifyMembers} />
        </div>
      ) : null}
    </div>
  );
}
