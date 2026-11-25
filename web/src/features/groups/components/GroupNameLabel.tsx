import { GroupAvatar } from "@/src/features/groups/components/GroupAvatar";

export function GroupNameLabel({ name }: { name: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <GroupAvatar size="sm" />
      <span className="truncate" title={name}>
        {name}
      </span>
    </span>
  );
}
