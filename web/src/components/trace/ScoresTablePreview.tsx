import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { type Score } from "@langfuse/shared";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";

type ScoresTablePreviewRow = {
  name: string;
  value: number;
  source: string;
  timestamp: string;
  comment?: string | null;
};

export const ScoresTablePreview = ({ scores }: { scores: Score[] }) => {
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const totalCount = scores.length;

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

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<ScoresTablePreviewRow>(
      "scoresColumnVisibility",
      columns,
    );

  return (
    <div className="flex max-h-[calc(100vh-20rem)] flex-col gap-1 overflow-hidden">
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
        pagination={{
          pageCount: Math.ceil(totalCount / paginationState.pageSize),
          onChange: setPaginationState,
          state: paginationState,
        }}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
      />
    </div>
  );
};
