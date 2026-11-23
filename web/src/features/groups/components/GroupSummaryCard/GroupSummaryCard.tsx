import { Lock } from "@langfuse/icons";
import { type Role } from "@langfuse/shared";

import { Avatar } from "@/src/components/design-system/Avatar/Avatar";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import {
  memberCountLabel,
  type StackMember,
} from "@/src/features/groups/components/GroupMemberStack";
import {
  isScimManaged,
  SCIM_MANAGED_LABEL,
} from "@/src/features/groups/groupSource";
import { roleName } from "@/src/features/rbac/components/roleDisplay";

type GroupSummaryCardProps = {
  name: string;
  /** Where the group's role applies. */
  level: "organization" | "project";
  source: "SCIM" | "MANUAL" | "SYSTEM";
  role: Role;
  memberCount: number;
  /** The group's first few members; `memberCount` is the full size. */
  memberPreview: StackMember[];
  /** Where "View all members" leads. */
  href: string;
};

/** What a group is, the access it sets and who is in it, sized for a hover card. */
export function GroupSummaryCard({
  name,
  level,
  source,
  role,
  memberCount,
  memberPreview,
  href,
}: GroupSummaryCardProps) {
  return (
    <div className="ph-no-capture flex w-72 flex-col divide-y text-sm">
      <div className="flex flex-col gap-0.5 px-4 py-3">
        <p className="font-bold break-words">{name}</p>
        <p className="text-muted-foreground text-xs">
          {level === "project" ? "Project-level" : "Org-level"} user group •{" "}
          {memberCountLabel(memberCount)}
        </p>
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-2.5">
        <span className="text-muted-foreground">Access level</span>
        <Badge color="blue" text={roleName(role)} />
      </div>
      {memberPreview.length > 0 && (
        <div className="flex flex-col gap-2 px-4 py-3">
          <ul className="flex flex-col gap-2">
            {memberPreview.map((member) => {
              const displayName = member.name ?? member.email ?? "";
              return (
                <li key={member.userId} className="flex items-center gap-2">
                  <Avatar
                    aria-hidden
                    size="sm"
                    tone="tinted"
                    displayName={displayName}
                    src={member.image ?? undefined}
                  />
                  <span className="truncate" title={displayName}>
                    {displayName}
                  </span>
                </li>
              );
            })}
          </ul>
          {memberCount > memberPreview.length && (
            <TextLink path={href} value={`View all ${memberCount} members`} />
          )}
        </div>
      )}
      {isScimManaged({ source }) && (
        <p className="text-muted-foreground flex items-center gap-1.5 px-4 py-2.5 text-xs">
          <Lock size="sm" aria-hidden="true" />
          {SCIM_MANAGED_LABEL}
        </p>
      )}
    </div>
  );
}
