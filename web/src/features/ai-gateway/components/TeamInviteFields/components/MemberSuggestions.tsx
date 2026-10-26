import { Plus } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import type { RouterOutputs } from "@/src/utils/api";

type SuggestedMember =
  RouterOutputs["aiGateway"]["getNotifiableMembers"]["preview"][number];

export type MemberSuggestionsProps = {
  memberCount: number;
  /** Members not picked yet. */
  members: SuggestedMember[];
  onSelectAll: () => void;
  onAddMember: (email: string) => void;
};

function MemberSuggestion({
  member,
  onAddMember,
}: {
  member: SuggestedMember;
  onAddMember: (email: string) => void;
}) {
  function handleClick() {
    onAddMember(member.email);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      icon={Plus}
      text={member.name ?? member.email}
      onClick={handleClick}
    />
  );
}

/** Quick picks below the input: every existing member, or one at a time. */
export function MemberSuggestions({
  memberCount,
  members,
  onSelectAll,
  onAddMember,
}: MemberSuggestionsProps) {
  return (
    <div className="ph-no-capture flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        icon={Plus}
        text={`All existing members (${memberCount})`}
        onClick={onSelectAll}
      />
      {members.map((member) => (
        <MemberSuggestion
          key={member.id}
          member={member}
          onAddMember={onAddMember}
        />
      ))}
    </div>
  );
}
