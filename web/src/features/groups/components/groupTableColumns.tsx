import { type LangfuseColumnDef } from "@/src/components/table/types";
import { GroupNameLabel } from "@/src/features/groups/components/GroupNameLabel";
import {
  GroupMemberStack,
  type StackMember,
} from "@/src/features/groups/components/GroupMemberStack";
import {
  GroupSourceLabel,
  type GroupSource,
} from "@/src/features/groups/components/GroupSourceLabel";

type GroupTableRow = {
  group: { displayName: string; source: GroupSource; members: StackMember[] };
};

export function groupTableColumns<T extends GroupTableRow>() {
  return {
    name: {
      accessorKey: "displayName",
      header: "Name",
      sensitive: true,
      size: 240,
      cell: ({ row }) => (
        <GroupNameLabel name={row.original.group.displayName} />
      ),
    },
    source: {
      accessorKey: "source",
      header: "Source",
      enableHiding: true,
      headerTooltip: {
        description:
          "SCIM: synced from your identity provider, so its name and members are managed there. Created in Langfuse: made here by an admin.",
      },
      size: 180,
      cell: ({ row }) => (
        <GroupSourceLabel source={row.original.group.source} />
      ),
    },
    members: {
      accessorKey: "memberCount",
      header: "Members",
      size: 180,
      cell: ({ row }) => (
        <GroupMemberStack members={row.original.group.members} />
      ),
    },
  } satisfies Record<string, LangfuseColumnDef<T>>;
}
