import { LangfuseColumnDef } from "@/src/components/table/types";
import { RouterOutput } from "@/src/utils/types";

export const conversationTableColumns: LangfuseColumnDef<
  RouterOutput["conversations"]["all"]["sessions"][number]
>[] = [
  {
    accessorKey: "id",
    id: "id",
    header: "id",
    cell: ({ row }) => {
      return (
        <span className="truncate py-3 font-mono text-sm font-semibold">
          {row.original.id}
        </span>
      );
    },
  },
];
