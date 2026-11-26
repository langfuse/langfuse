import { AvatarGroup } from "@/src/components/design-system/AvatarGroup/AvatarGroup";
import {
  memberCountLabel,
  memberDisplayName,
  type GroupMember,
} from "@/src/features/groups/groupMember";

const AVATAR_STACK_SIZE = 4;

export function GroupMemberStack({ members }: { members: GroupMember[] }) {
  if (members.length === 0) {
    return <span className="text-muted-foreground">No members</span>;
  }
  return (
    <AvatarGroup
      max={AVATAR_STACK_SIZE}
      label={memberCountLabel(members.length)}
      avatars={members.map((member) => ({
        id: member.userId,
        displayName: memberDisplayName(member),
        email: member.email,
        src: member.image ?? undefined,
      }))}
    />
  );
}
