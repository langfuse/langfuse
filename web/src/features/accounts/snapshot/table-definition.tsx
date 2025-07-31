import type { LangfuseColumnDef } from "@/src/components/table/types";
import type { RouterOutput } from "@/src/utils/types";
import { ArrowUpRight, Eye } from "lucide-react";
import Link from "next/link";

export const snapshotTableColumns: LangfuseColumnDef<
  RouterOutput["accounts"]["getSnapshotUsers"][number]
>[] = [
  {
    accessorKey: "username",
    id: "username",
    header: "Snapshot User",
    cell: ({ row }) => {
      return (
        <span className="truncate py-3 font-mono text-sm font-semibold">
          {row.original.username}
        </span>
      );
    },
    size: 75,
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    size: 100,
    cell: ({ row }) => {
      return (
        <span className="text-sm text-muted-foreground">
          {row.original.createdAt
            ? new Date(row.original.createdAt).toLocaleDateString()
            : "N/A"}
        </span>
      );
    },
  },
  {
    accessorKey: "metadata",
    header: "Snapshot Metadata",
    size: 150,
    cell: ({ row }) => {
      return (
        <span className="text-sm text-muted-foreground">
          {row.original.metadata
            ? JSON.stringify(row.original.metadata)
            : "N/A"}
        </span>
      );
    },
  },
  {
    accessorKey: "conversations",
    header: "Conversations",
    size: 100,
    cell: ({ row }) => {
      return (
        <Link
          className="flex items-center gap-1 whitespace-nowrap underline"
          href={`/project/${row.original.projectId}/conversations?accountId=${row.original.username}`}
        >
          View conversations <ArrowUpRight size={12} />
        </Link>
      );
    },
  },
  {
    accessorKey: "view",
    header: "View",
    size: 60,
    cell: ({ row }) => {
      return (
        <Link
          className="flex items-center gap-1 whitespace-nowrap text-muted-foreground hover:text-foreground"
          href={`/project/${row.original.projectId}/snapshots/${row.original.id}`}
        >
          <Eye size={12} />
          View
        </Link>
      );
    },
  },
];
