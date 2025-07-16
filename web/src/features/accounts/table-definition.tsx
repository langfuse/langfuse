import { LangfuseColumnDef } from "@/src/components/table/types";
import { Button } from "@/src/components/ui/button";
import { RouterOutput } from "@/src/utils/types";
import { ArrowUpRight, Ellipsis, LinkIcon } from "lucide-react";
import Link from "next/link";

export type AccountTableMeta = {
  projectId: string;
};

export const accountTableColumns: LangfuseColumnDef<
  RouterOutput["accounts"]["getUsers"][number]
>[] = [
  {
    accessorKey: "identifier",
    id: "identifier",
    header: "Identifier",

    cell: ({ row }) => {
      return (
        <span className="truncate py-3 font-mono text-sm font-semibold">
          {row.original.identifier}
        </span>
      );
    },
    size: 300,
  },
  {
    accessorKey: "conversations",
    header: "Conversations",
    size: 100,
    cell: ({ row, table }) => {
      const projectId = (table.options.meta as AccountTableMeta).projectId;

      return (
        <Link
          className="flex items-center gap-1 whitespace-nowrap underline"
          href={`/project/${projectId}/conversations?account=${row.original.identifier}`}
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
