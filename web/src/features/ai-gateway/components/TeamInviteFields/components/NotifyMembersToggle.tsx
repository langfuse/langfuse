import { useId } from "react";

import { Avatar } from "@/src/components/design-system/Avatar/Avatar";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import type { RouterOutputs } from "@/src/utils/api";

export type NotifyMembersToggleProps = {
  memberCount: number;
  previewMembers: RouterOutputs["aiGateway"]["getNotifiableMembers"]["preview"];
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
    <div className="flex items-center gap-3">
      <div className="ph-no-capture flex shrink-0 items-center -space-x-1">
        {previewMembers.map((member) => (
          <span
            key={member.id}
            className="ring-background inline-flex rounded-full ring-2"
          >
            <Avatar
              size="sm"
              tone="tinted"
              displayName={member.name ?? member.email ?? ""}
              email={member.email ?? undefined}
              src={member.image ?? undefined}
            />
          </span>
        ))}
        {overflowCount > 0 ? (
          <span className="bg-muted text-foreground-secondary ring-background flex size-6 items-center justify-center rounded-full text-[10px] ring-2">
            +{overflowCount}
          </span>
        ) : null}
      </div>
      <label
        htmlFor={id}
        className="flex min-w-0 flex-1 cursor-pointer flex-col"
      >
        <span className="text-sm">
          Notify the {memberCount} existing member
          {memberCount === 1 ? "" : "s"}
        </span>
        <span className="text-muted-foreground text-xs">
          They get an email that the AI Gateway is available.
        </span>
      </label>
      <Switch
        id={id}
        size="sm"
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
