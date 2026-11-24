import { Avatar } from "@/src/components/design-system/Avatar/Avatar";

/** A group member as an avatar and a name, falling back to the email. */
export function GroupMemberName({
  member,
  showEmail = false,
}: {
  member: { name: string | null; email: string | null; image: string | null };
  /** Adds the email under the name, to tell apart members with the same name. */
  showEmail?: boolean;
}) {
  const displayName = member.name ?? member.email ?? "";
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
      <span className="ph-no-capture flex min-w-0 flex-col">
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
