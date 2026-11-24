import { AvatarGroup } from "@/src/components/design-system/AvatarGroup/AvatarGroup";

const AVATAR_STACK_SIZE = 4;

export const memberCountLabel = (count: number) =>
  `${count} ${count === 1 ? "member" : "members"}`;

export type StackMember = {
  userId: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

export function GroupMemberStack({ members }: { members: StackMember[] }) {
  if (members.length === 0) {
    return <span className="text-muted-foreground">No members</span>;
  }
  return (
    <AvatarGroup
      max={AVATAR_STACK_SIZE}
      label={memberCountLabel(members.length)}
      avatars={members.map((member) => ({
        id: member.userId,
        displayName: member.name ?? member.email ?? "",
        email: member.email,
        src: member.image ?? undefined,
      }))}
    />
  );
}
