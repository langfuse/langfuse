import { GroupIcon } from "@/src/features/groups/components/GroupIcon";

/** A group as its round icon and its name. */
export function GroupNameLabel({ name }: { name: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <GroupIcon />
      <span className="truncate" title={name}>
        {name}
      </span>
    </span>
  );
}
