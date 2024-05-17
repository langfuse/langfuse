import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import { type Score } from "@langfuse/shared";

type ScoresTablePreviewRow = {
  name: string;
  value: number;
  source: string;
  timestamp: string;
  comment?: string | null;
};

export const ScoresTablePreview = ({ scores }: { scores: Score[] }) => {
  const columns: LangfuseColumnDef<ScoresTablePreviewRow>[] = [
    {
      accessorKey: "name",
      header: "Name",
      id: "name",
    },
    {
      accessorKey: "value",
      header: "Value",
      id: "value",
      cell: ({ row }) => {
        const value: number = row.getValue("value");
        return value % 1 === 0 ? value : value.toFixed(4);
      },
    },
    {
      accessorKey: "source",
      header: "Source",
      id: "source",
    },
    {
      accessorKey: "timestamp",
      header: "Timestamp",
      id: "timestamp",
    },
    {
      accessorKey: "comment",
      header: "Comment",
      id: "comment",
      cell: ({ row }) => {
        const value: ScoresTablePreviewRow["comment"] = row.getValue("comment");
        return !!value && <IOTableCell data={value} singleLine />;
      },
    },
  ];

  return (
    <div className="flex max-h-[calc(100vh-30rem)] flex-col gap-1 overflow-hidden">
      <span className="text-sm font-semibold">Scores</span>
      <DataTable
        columns={columns}
        data={{
          isLoading: false,
          isError: false,
          data: scores.map((s) => ({
            timestamp: s.timestamp.toLocaleString(),
            name: s.name,
            value: s.value,
            source: s.source,
            comment: s.comment,
          })),
        }}
      />
    </div>
  );
};
