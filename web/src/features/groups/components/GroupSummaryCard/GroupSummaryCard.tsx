import { Lock, Users } from "@langfuse/icons";
import { type Role } from "@langfuse/shared";

import { GroupLink } from "@/src/features/groups/components/GroupLink";
import {
  memberCountLabel,
  type StackMember,
} from "@/src/features/groups/components/GroupMemberStack";
import {
  isScimManaged,
  SCIM_MANAGED_LABEL,
} from "@/src/features/groups/groupSource";
import { GroupMemberName } from "@/src/features/groups/components/GroupMemberName";
import { IconTile } from "@/src/features/rbac/components/IconTile";
import { roleName } from "@/src/features/rbac/components/roleDisplay";

type GroupLevel = "organization" | "project";

type GroupSummaryCardProps = {
  name: string;
  /** Where the group's role applies. */
  level: GroupLevel;
  source: "SCIM" | "MANUAL";
  role: Role;
  memberCount: number;
  /** The group's first few members; `memberCount` is the full size. */
  memberPreview: StackMember[];
  /** Opens the full member list; without it the hidden members are only counted. */
  membersHref?: string | null;
  /** Whether the viewer may change the group; names the link for groups created in Langfuse. */
  canEditGroup?: boolean;
};

/** What a group is, the access it sets and who is in it, sized for a hover card. */
export function GroupSummaryCard({
  name,
  level,
  source,
  role,
  memberCount,
  memberPreview,
  membersHref,
  canEditGroup = false,
}: GroupSummaryCardProps) {
  const hiddenMembers = memberCount - memberPreview.length;
  return (
    <div className="ph-no-capture flex w-85 flex-col divide-y text-sm">
      <div className="flex flex-col gap-3.5 px-4 pt-4 pb-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <IconTile icon={Users} shape="largeCircle" />
          <div className="flex min-w-0 flex-col">
            <p className="text-base leading-5 font-bold break-words">{name}</p>
            <p className="text-muted-foreground leading-snug">
              Org-level user group · {memberCountLabel(memberCount)}
            </p>
          </div>
        </div>
        <div className="bg-muted flex items-center justify-between gap-3 rounded-lg px-2.5 py-2">
          <span className="text-muted-foreground">
            {level === "project"
              ? "Access on this project"
              : "Access in this organization"}
          </span>
          <span className="font-bold">{roleName(role)}</span>
        </div>
      </div>
      {memberPreview.length > 0 && (
        <div className="flex flex-col gap-3 px-4 py-3">
          <ul className="flex flex-col gap-3 text-base">
            {memberPreview.map((member) => (
              <li key={member.userId} className="flex">
                <GroupMemberName member={member} />
              </li>
            ))}
          </ul>
          {hiddenMembers > 0 &&
            (membersHref ? (
              <GroupLink
                href={membersHref}
                className="text-muted-foreground hover:text-foreground self-start hover:underline"
              >
                View all {memberCountLabel(memberCount)}
              </GroupLink>
            ) : (
              <p className="text-muted-foreground text-xs">
                +{hiddenMembers} more{" "}
                {hiddenMembers === 1 ? "member" : "members"}
              </p>
            ))}
        </div>
      )}
      {isScimManaged({ source }) && (
        <p className="text-muted-foreground flex items-center gap-1.5 px-4 py-3 text-xs">
          <Lock size="sm" aria-hidden="true" />
          {SCIM_MANAGED_LABEL}
        </p>
      )}
      {source === "MANUAL" && (
        <div className="text-muted-foreground flex items-center justify-between gap-3 px-4 py-3 text-xs">
          <span>Created in Langfuse</span>
          {membersHref && (
            <GroupLink
              href={membersHref}
              className="text-link hover:text-link-hover"
            >
              {canEditGroup ? "Edit group" : "View group"}
            </GroupLink>
          )}
        </div>
      )}
    </div>
  );
}
