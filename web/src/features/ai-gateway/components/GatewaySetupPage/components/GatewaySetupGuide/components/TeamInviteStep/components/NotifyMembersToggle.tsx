import { useId } from "react";

import { Avatar } from "@/src/components/design-system/Avatar/Avatar";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { TagShell } from "@/src/components/design-system/Tag/Tag";
import type { RouterOutputs } from "@/src/utils/api";

export type NotifyMembersToggleProps = {
  memberCount: number;
  previewMembers: RouterOutputs["aiGateway"]["getTeamInviteSummary"]["notifiableMemberPreview"];
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function NotifyMembersToggle({
  memberCount,
  previewMembers,
  checked,
  onCheckedChange,
}: NotifyMembersToggleProps) {
  const id = useId();
  const overflowCount = memberCount - previewMembers.length;

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <Switch
        id={id}
        size="sm"
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
      <label htmlFor={id} className="cursor-pointer">
        Notify the {memberCount} existing member{memberCount === 1 ? "" : "s"}
      </label>
      <div className="ph-no-capture flex items-center -space-x-1.5">
        {previewMembers.map((member) => (
          <Avatar
            key={member.id}
            size="sm"
            displayName={member.name ?? member.email ?? ""}
            email={member.email ?? undefined}
            src={member.image ?? undefined}
          />
        ))}
      </div>
      {overflowCount > 0 ? <TagShell>+{overflowCount}</TagShell> : null}
    </div>
  );
}
