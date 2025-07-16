import { LangfuseColumnDef } from "@/src/components/table/types";
import { Button } from "@/src/components/ui/button";
import { RouterOutput } from "@/src/utils/types";
import { ArrowUpRight, Ellipsis } from "lucide-react";
import Link from "next/link";

export const accountTableColumns: LangfuseColumnDef<
  RouterOutput["accounts"]["getUsers"][number]
>[] = [
  {
    accessorKey: "username",
    id: "username",
    header: "username",

    cell: ({ row }) => {
      return (
        <span className="truncate py-3 font-mono text-sm font-semibold">
          {row.original.username}
        </span>
      );
    },
    size: 300,
  },
  {
    accessorKey: "conversations",
    header: "Conversations",
    size: 100,
    cell: ({ row }) => {
      return (
        <Link
          className="flex items-center gap-1 whitespace-nowrap underline"
          href={`/project/${row.original.projectId}/conversations?accountId=${row.original.id}`}
        >
          View conversations <ArrowUpRight size={12} />
        </Link>
      );
    },
  },
  {
    accessorKey: "manage",
    header: "Manage",
    size: 80,
    cell: ({ row }) => {
      return (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon">
            <Ellipsis />
          </Button>
        </div>
      );
    },
  },
];
