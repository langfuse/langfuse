import { Avatar } from "@/src/components/design-system/Avatar/Avatar";
import {
  memberDisplayName,
  type GroupMember,
} from "@/src/features/groups/groupMember";

export function GroupMemberName({
  member,
  showEmail = false,
}: {
  member: GroupMember;
  showEmail?: boolean;
}) {
  const displayName = memberDisplayName(member);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar
        aria-hidden
        size="sm"
        tone="tinted"
        shouldShowTooltip={false}
        displayName={displayName}
        src={member.image ?? undefined}
      />
      <span className="flex min-w-0 flex-col">
        <span className="truncate" title={displayName}>
          {displayName}
        </span>
        {showEmail && member.name && member.email && (
          <span
            className="text-muted-foreground truncate text-xs"
            title={member.email}
          >
            {member.email}
          </span>
        )}
      </span>
    </span>
  );
}
