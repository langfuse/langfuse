import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { type RouterOutputs, api } from "@/src/utils/api";
import { createColumnHelper } from "@tanstack/react-table";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";

export type EvalsTemplateRow = {
  name: string;
  latestCreatedAt?: Date;
  latestVersion?: number;
  latestId?: string;
};

export default function EvalsTemplateTable({
  projectId,
}: {
  projectId: string;
}) {
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const templates = api.evals.templateNames.useQuery({
    projectId,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
  });
  const totalCount = templates.data?.totalCount ?? 0;

  const columnHelper = createColumnHelper<EvalsTemplateRow>();

  const columns = [
    columnHelper.accessor("name", {
      header: "Name",
      id: "name",
      cell: (row) => {
        const name = row.getValue();
        const id = row.row.original.latestId;

        if (!id) {
          return name;
        }

        return name ? (
          <TableLink
            path={`/project/${projectId}/evals/templates/${encodeURIComponent(id)}`}
            value={name}
            truncateAt={50}
          />
        ) : undefined;
      },
    }),
    columnHelper.accessor("latestCreatedAt", {
      header: "Last Edit",
      id: "latestCreatedAt",
      cell: (row) => {
        return row.getValue()?.toLocaleDateString();
      },
    }),
    columnHelper.accessor("latestVersion", {
      header: "Last Version",
      id: "version",
      cell: (row) => {
        return row.getValue();
      },
    }),
  ] as LangfuseColumnDef<EvalsTemplateRow>[];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<EvalsTemplateRow>(
      "evalTemplatesColumnVisibility",
      columns,
    );

  const convertToTableRow = (
    template: RouterOutputs["evals"]["templateNames"]["templates"][number],
  ): EvalsTemplateRow => {
    return {
      name: template.name,
      latestCreatedAt: template.latestCreatedAt,
      latestVersion: template.version,
      latestId: template.latestId,
    };
  };

  return (
    <DataTable
      columns={columns}
      data={
        templates.isLoading
          ? { isLoading: true, isError: false }
          : templates.isError
            ? {
                isLoading: false,
                isError: true,
                error: templates.error.message,
              }
            : {
                isLoading: false,
                isError: false,
                data: templates.data.templates.map((t) => convertToTableRow(t)),
              }
      }
      pagination={{
        pageCount: Math.ceil(totalCount / paginationState.pageSize),
        onChange: setPaginationState,
        state: paginationState,
      }}
      columnVisibility={columnVisibility}
      onColumnVisibilityChange={setColumnVisibility}
    />
  );
}
