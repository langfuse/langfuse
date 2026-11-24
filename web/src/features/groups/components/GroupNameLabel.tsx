import { Users } from "@langfuse/icons";

import { IconTile } from "@/src/features/rbac/components/IconTile";

/** A group as its round icon and its name. */
export function GroupNameLabel({ name }: { name: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <IconTile icon={Users} shape="circle" />
      <span className="truncate" title={name}>
        {name}
      </span>
    </span>
  );
}
