import { type LangfuseColumnDef } from "@/src/components/table/types";
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
      cell: ({ row }) => (
        <span className="truncate" title={row.original.group.displayName}>
          {row.original.group.displayName}
        </span>
      ),
    },
    source: {
      accessorKey: "source",
      header: "Source",
      enableHiding: true,
      headerTooltip: {
        description:
          "SCIM: synced from your identity provider, so its name and members are managed there. Langfuse: created here by an admin.",
      },
      size: 120,
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
