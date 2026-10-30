import { Plus } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import type { RouterOutputs } from "@/src/utils/api";

export type MemberSuggestionProps = {
  member: RouterOutputs["aiGateway"]["getMemberSuggestions"][number];
  onAdd: (member: MemberSuggestionProps["member"]) => void;
};

export function MemberSuggestion({ member, onAdd }: MemberSuggestionProps) {
  function handleClick() {
    onAdd(member);
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
