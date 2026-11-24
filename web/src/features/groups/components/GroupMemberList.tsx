import { X } from "@langfuse/icons";

import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { GroupMemberName } from "@/src/features/groups/components/GroupMemberName";
import { type GroupMember } from "@/src/features/groups/components/GroupMemberStack";

const sortKey = (member: GroupMember) => member.name ?? member.email ?? "";

/** A group's members, A to Z. A remove button shows on the row being pointed at or focused. */
export function GroupMemberList({
  members,
  onRemove,
}: {
  members: GroupMember[];
  /** Adds a remove button to each row. */
  onRemove?: (member: GroupMember) => void;
}) {
  const sorted = members.toSorted((a, b) =>
    sortKey(a).localeCompare(sortKey(b)),
  );
  return (
    <ul
      aria-label="Members"
      // Names and emails, also in the remove buttons, stay out of session replay.
      className="ph-no-capture flex flex-col rounded-lg border p-1"
    >
      {sorted.map((member) => (
        <li
          key={member.userId}
          className="group/member hover:bg-surface-section focus-within:bg-surface-section flex min-h-13 items-center gap-2.5 rounded-md py-1.5 pr-2 pl-2.5"
        >
          <span className="flex min-w-0 flex-1">
            <GroupMemberName member={member} showEmail />
          </span>
          {onRemove && (
            <span className="flex shrink-0 opacity-0 group-focus-within/member:opacity-100 group-hover/member:opacity-100 pointer-coarse:opacity-100">
              <IconButton
                icon={X}
                size="sm"
                label={`Remove ${member.name ?? member.email ?? "member"} from group`}
                onClick={() => onRemove(member)}
              />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
