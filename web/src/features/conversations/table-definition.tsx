import type { LangfuseColumnDef } from "@/src/components/table/types";
import type { RouterOutput } from "@/src/utils/types";

export const conversationTableColumns: LangfuseColumnDef<
  RouterOutput["conversations"]["all"]["sessions"][number]
>[] = [
  {
    accessorKey: "userId",
    id: "userId",
    header: "User",
    cell: ({ row }) => {
      return (
        <span className="truncate py-3 font-mono text-sm font-semibold">
          {row.original.userIds.join(", ")}
        </span>
      );
    },
    size: 75,
  },
  {
    accessorKey: "id",
    id: "id",
    header: "Session",
    cell: ({ row }) => {
      return (
        <span className="truncate py-3 font-mono text-sm font-semibold">
          {row.original.id}
        </span>
      );
    },
  },
  {
    accessorKey: "createdAt",
    id: "createdAt",
    header: "Date",
    cell: ({ row }) => {
      return (
        <span className="truncate py-3 font-mono text-sm font-semibold">
          {row.original.createdAt.toLocaleString()}
        </span>
      );
    },
  },
];
