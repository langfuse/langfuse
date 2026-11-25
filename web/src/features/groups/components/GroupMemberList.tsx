import { X } from "@langfuse/icons";

import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { GroupMemberName } from "@/src/features/groups/components/GroupMemberName";
import {
  memberDisplayName,
  type GroupMember,
} from "@/src/features/groups/groupMember";

export function GroupMemberList({
  members,
  onRemove,
}: {
  members: GroupMember[];
  onRemove?: (member: GroupMember) => void;
}) {
  const sorted = members.toSorted((a, b) =>
    memberDisplayName(a).localeCompare(memberDisplayName(b)),
  );
  return (
    <ul
      aria-label="Members"
      className="ph-no-capture flex flex-col rounded-lg border p-1"
    >
      {sorted.map((member) => (
        <li
          key={member.userId}
          className="flex min-h-12 items-center gap-2 rounded-md px-2 py-1.5"
        >
          <span className="flex min-w-0 flex-1">
            <GroupMemberName member={member} showEmail />
          </span>
          {onRemove && (
            <IconButton
              icon={X}
              size="sm"
              label={`Remove ${memberDisplayName(member) || "member"} from group`}
              onClick={() => onRemove(member)}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
