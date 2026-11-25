import { useState } from "react";
import { PlusIcon } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import {
  MultiSelectInput,
  type MultiSelectOption,
} from "@/src/components/design-system/MultiSelectInput/MultiSelectInput";
import { GroupMemberList } from "@/src/features/groups/components/GroupMemberList";
import {
  memberCountLabel,
  type GroupMember,
} from "@/src/features/groups/groupMember";

type AddMembers = {
  candidates: MultiSelectOption<string>[];
  isLoadingCandidates: boolean;
  isAdding: boolean;
  onAdd: (userIds: string[]) => Promise<unknown>;
};

export function GroupMembersSection({
  members,
  addMembers,
  onRemove,
  error,
}: {
  members: GroupMember[];
  addMembers?: AddMembers;
  onRemove?: (member: GroupMember) => void;
  error?: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <p className="flex items-baseline gap-1.5 font-bold">
        Members
        <span className="text-muted-foreground font-normal">
          {members.length}
        </span>
      </p>
      {addMembers && <AddMembersControl {...addMembers} />}
      {members.length > 0 ? (
        <GroupMemberList members={members} onRemove={onRemove} />
      ) : (
        <p className="text-muted-foreground">This group has no members.</p>
      )}
      {error && <p className="text-destructive">{error}</p>}
    </section>
  );
}

function AddMembersControl({
  candidates,
  isLoadingCandidates,
  isAdding,
  onAdd,
}: AddMembers) {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <MultiSelectInput
          aria-label="Add members"
          value={selected}
          options={candidates}
          onValueChange={setSelected}
          placeholder="Select organization members"
          selectedLabel={`${memberCountLabel(selected.length)} selected`}
          searchPlaceholder="Search members"
          emptyMessage="No more organization members to add"
          disabled={isLoadingCandidates}
        />
      </div>
      <Button
        text="Add"
        icon={PlusIcon}
        disabled={selected.length === 0}
        loading={isAdding}
        onClick={() => {
          onAdd(selected).then(
            () => setSelected([]),
            () => undefined,
          );
        }}
      />
    </div>
  );
}
