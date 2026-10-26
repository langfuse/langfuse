import { useId } from "react";
import { Users } from "@langfuse/icons";

import { Tag } from "@/src/components/design-system/Tag/Tag";
import { EmailTagInput } from "@/src/features/ai-gateway/components/TeamInviteFields/components/EmailTagInput/EmailTagInput";
import { appendEmails } from "@/src/features/ai-gateway/components/TeamInviteFields/components/EmailTagInput/fns/emailText";
import { ExternalInviteeHint } from "@/src/features/ai-gateway/components/TeamInviteFields/components/ExternalInviteeHint";
import {
  MemberSuggestions,
  type MemberSuggestionsProps,
} from "@/src/features/ai-gateway/components/TeamInviteFields/components/MemberSuggestions";
import { getInviteeKind } from "@/src/features/ai-gateway/fns/getInviteeKind";
import type { TeamInviteMembers } from "@/src/features/ai-gateway/types/teamInviteMembers";

export type TeamInviteFieldsProps = {
  emails: string[];
  onEmailsChange: (emails: string[]) => void;
  members: TeamInviteMembers;
  /** Shown below the input while set. */
  errorMessage?: string;
  /** Omit when there is nobody to notify or email is not configured. */
  memberSuggestions?: {
    memberCount: number;
    previewMembers: MemberSuggestionsProps["members"];
    isAllSelected: boolean;
    onAllSelectedChange: (isSelected: boolean) => void;
  };
};

/**
 * Recipient picker: typed addresses and picked members as chips, quick picks
 * for existing members below, and a note on who gets invited to the organization.
 */
export function TeamInviteFields({
  emails,
  onEmailsChange,
  members,
  errorMessage,
  memberSuggestions,
}: TeamInviteFieldsProps) {
  const inputId = useId();
  const errorId = useId();
  const externalCount = emails.filter(
    (email) => getInviteeKind(email, members) === "external",
  ).length;
  const isAllSelected = memberSuggestions?.isAllSelected ?? false;
  const unpickedMembers =
    memberSuggestions?.previewMembers.filter(
      (member) => !emails.includes(member.email.toLowerCase()),
    ) ?? [];

  function handleAddMember(email: string) {
    onEmailsChange(appendEmails(emails, email));
  }

  function handleSelectAll() {
    memberSuggestions?.onAllSelectedChange(true);
  }

  function handleDeselectAll() {
    memberSuggestions?.onAllSelectedChange(false);
  }

  return (
    <div className="flex max-w-xl flex-col gap-2">
      <div className="has-[input:focus]:border-ring rounded-md border px-3 py-2">
        <EmailTagInput
          id={inputId}
          value={emails}
          onChange={onEmailsChange}
          members={members}
          aria-describedby={errorMessage ? errorId : undefined}
        >
          {memberSuggestions && isAllSelected ? (
            <Tag
              text="All existing members"
              secondaryText={String(memberSuggestions.memberCount)}
              icon={Users}
              remove={{ onRemove: handleDeselectAll }}
            />
          ) : null}
        </EmailTagInput>
      </div>
      {errorMessage ? (
        <p id={errorId} role="alert" className="text-destructive text-xs">
          {errorMessage}
        </p>
      ) : null}
      {memberSuggestions && !isAllSelected ? (
        <MemberSuggestions
          memberCount={memberSuggestions.memberCount}
          members={unpickedMembers}
          onSelectAll={handleSelectAll}
          onAddMember={handleAddMember}
        />
      ) : null}
      {externalCount > 0 ? <ExternalInviteeHint count={externalCount} /> : null}
    </div>
  );
}
