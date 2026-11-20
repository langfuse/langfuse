import { Avatar } from "@/src/components/design-system/Avatar/Avatar";
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";

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
  const shown = members.slice(0, AVATAR_STACK_SIZE);
  const overflow = members.length - shown.length;
  return (
    <HoverCard
      openDelay={150}
      closeDelay={100}
      placement="bottom"
      content={
        <div className="flex max-h-72 w-64 flex-col gap-2 overflow-y-auto p-3 text-xs">
          <p className="font-medium">{memberCountLabel(members.length)}</p>
          <ul className="flex flex-col gap-1.5">
            {members.map((member) => (
              <li key={member.userId} className="flex items-center gap-2">
                <Avatar
                  aria-hidden
                  size="sm"
                  tone="tinted"
                  displayName={member.name ?? member.email ?? ""}
                  src={member.image ?? undefined}
                />
                <span className="flex min-w-0 flex-col">
                  <span
                    className="truncate"
                    title={member.name ?? member.email ?? undefined}
                  >
                    {member.name ?? member.email}
                  </span>
                  {member.name && member.email && (
                    <span
                      className="text-muted-foreground truncate"
                      title={member.email}
                    >
                      {member.email}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      }
    >
      {({ getTriggerProps }) => (
        <span
          className="inline-flex items-center"
          tabIndex={0}
          aria-label={`${members.length} members`}
          {...getTriggerProps()}
        >
          <span className="flex -space-x-1.5">
            {shown.map((member) => (
              <span
                key={member.userId}
                className="ring-background inline-flex rounded-full ring-2"
              >
                <Avatar
                  aria-hidden
                  size="sm"
                  tone="tinted"
                  displayName={member.name ?? member.email ?? ""}
                  src={member.image ?? undefined}
                />
              </span>
            ))}
          </span>
          {overflow > 0 && (
            <span className="text-muted-foreground ml-1.5 text-xs">
              +{overflow}
            </span>
          )}
        </span>
      )}
    </HoverCard>
  );
}
