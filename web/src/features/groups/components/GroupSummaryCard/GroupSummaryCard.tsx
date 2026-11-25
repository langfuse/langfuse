import { Lock } from "@langfuse/icons";
import { type Role } from "@langfuse/shared";

import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { GroupAvatar } from "@/src/features/groups/components/GroupAvatar";
import { GroupMemberName } from "@/src/features/groups/components/GroupMemberName";
import {
  memberCountLabel,
  type GroupMember,
} from "@/src/features/groups/groupMember";
import {
  GROUP_SOURCE_DISPLAY,
  isScimManaged,
  SCIM_MANAGED_LABEL,
} from "@/src/features/groups/groupSource";
import { roleName } from "@/src/features/rbac/components/roleDisplay";

type GroupSummaryCardProps = {
  name: string;
  level: "organization" | "project";
  source: "SCIM" | "MANUAL";
  role: Role;
  memberCount: number;
  /** The group's first few members; empty when the viewer may not see them. */
  memberPreview: GroupMember[];
  groupHref?: string | null;
};

export function GroupSummaryCard({
  name,
  level,
  source,
  role,
  memberCount,
  memberPreview,
  groupHref,
}: GroupSummaryCardProps) {
  const hiddenMembers = memberCount - memberPreview.length;
  return (
    <div className="ph-no-capture flex w-80 flex-col divide-y text-sm">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <GroupAvatar size="lg" />
          <div className="flex min-w-0 flex-col">
            <p className="text-base font-bold break-words">{name}</p>
            <p className="text-muted-foreground">
              Organization group · {memberCountLabel(memberCount)}
            </p>
          </div>
        </div>
        <div className="bg-muted flex items-center justify-between gap-3 rounded-lg px-3 py-2">
          <span className="text-muted-foreground">
            {level === "project"
              ? "Access on this project"
              : "Access in this organization"}
          </span>
          <span className="font-bold">{roleName(role)}</span>
        </div>
      </div>
      {memberPreview.length > 0 && (
        <div className="flex flex-col gap-3 p-4">
          <ul className="flex flex-col gap-3">
            {memberPreview.map((member) => (
              <li key={member.userId} className="flex">
                <GroupMemberName member={member} />
              </li>
            ))}
          </ul>
          {hiddenMembers > 0 && (
            <p className="text-muted-foreground text-xs">
              +{hiddenMembers} more {hiddenMembers === 1 ? "member" : "members"}
            </p>
          )}
        </div>
      )}
      <div className="text-muted-foreground flex items-center justify-between gap-3 px-4 py-3 text-xs">
        {isScimManaged({ source }) ? (
          <span className="flex items-center gap-1.5">
            <Lock size="sm" aria-hidden="true" />
            {SCIM_MANAGED_LABEL}
          </span>
        ) : (
          <span>{GROUP_SOURCE_DISPLAY.MANUAL.label}</span>
        )}
        {groupHref && <TextLink path={groupHref} value="Open group" />}
      </div>
    </div>
  );
}
