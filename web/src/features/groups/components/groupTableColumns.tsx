import { type LangfuseColumnDef } from "@/src/components/table/types";
import { GroupNameLabel } from "@/src/features/groups/components/GroupNameLabel";
import { GroupMemberStack } from "@/src/features/groups/components/GroupMemberStack";
import {
  GroupSourceLabel,
  type GroupSource,
} from "@/src/features/groups/components/GroupSourceLabel";
import { type GroupMember } from "@/src/features/groups/groupMember";

type GroupTableRow = {
  group: { displayName: string; source: GroupSource; members: GroupMember[] };
};

export function groupTableColumns<T extends GroupTableRow>() {
  return {
    name: {
      accessorKey: "displayName",
      header: "Name",
      size: 240,
      sensitive: true,
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
          "SCIM: synced from your identity provider, so its name and members are managed there. Created in Langfuse: added here by an admin.",
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
