import { useId } from "react";
import { Plus, Users } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { Tag } from "@/src/components/design-system/Tag/Tag";
import { EmailTagInput } from "@/src/features/ai-gateway/components/TeamInviteFields/components/EmailTagInput/EmailTagInput";
import { ExternalInviteeHint } from "@/src/features/ai-gateway/components/TeamInviteFields/components/ExternalInviteeHint";
import {
  MemberSuggestion,
  type MemberSuggestionProps,
} from "@/src/features/ai-gateway/components/TeamInviteFields/components/MemberSuggestion";
import { MemberSuggestionRow } from "@/src/features/ai-gateway/components/TeamInviteFields/components/MemberSuggestionRow";
import { getInviteeKind } from "@/src/features/ai-gateway/fns/getInviteeKind";
import type { TeamInviteMembers } from "@/src/features/ai-gateway/types/teamInviteMembers";

export type TeamInviteFieldsProps = {
  emails: string[];
  onEmailsChange: (emails: string[]) => void;
  /** Text being typed; doubles as the member search. */
  draft: string;
  onDraftChange: (draft: string) => void;
  members: TeamInviteMembers;
  /** Shown below the input while set. */
  errorMessage?: string;
  /** Omit when there is nobody to notify or email is not configured. */
  memberSuggestions?: {
    memberCount: number;
    /** Members matching the draft that are not picked yet. */
    suggestedMembers: MemberSuggestionProps["member"][];
    onMemberAdd: MemberSuggestionProps["onAdd"];
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
  draft,
  onDraftChange,
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
  const isSearching = draft.trim().length > 0;
  const suggestedMembers = memberSuggestions?.suggestedMembers ?? [];
  const showAllMembersSuggestion =
    memberSuggestions !== undefined && !isAllSelected && !isSearching;
  const showMemberSuggestions = !isAllSelected && suggestedMembers.length > 0;

  const topSuggestedMember = showMemberSuggestions
    ? suggestedMembers[0]
    : undefined;

  function handleAddMember(member: MemberSuggestionProps["member"]) {
    memberSuggestions?.onMemberAdd(member);
  }

  function handlePickTopSuggestion() {
    if (topSuggestedMember) handleAddMember(topSuggestedMember);
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
          draft={draft}
          onDraftChange={onDraftChange}
          onPickTopSuggestion={
            topSuggestedMember ? handlePickTopSuggestion : undefined
          }
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
      {(showAllMembersSuggestion || showMemberSuggestions) && (
        <MemberSuggestionRow>
          {showAllMembersSuggestion && (
            <Button
              variant="outline"
              size="sm"
              icon={Plus}
              text={`All existing members (${memberSuggestions.memberCount})`}
              onClick={handleSelectAll}
            />
          )}
          {showMemberSuggestions &&
            suggestedMembers.map((member) => (
              <MemberSuggestion
                key={member.id}
                member={member}
                onAdd={handleAddMember}
              />
            ))}
        </MemberSuggestionRow>
      )}
      {externalCount > 0 ? <ExternalInviteeHint count={externalCount} /> : null}
    </div>
  );
}
