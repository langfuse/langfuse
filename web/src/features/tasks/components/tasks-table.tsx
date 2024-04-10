import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
// import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import { useEffect } from "react";

type RowData = {
  name: string;
  id: string;
  createdAt: Date;
  description: string | null;
};

/**
 * TODO Add description and ui schema editors
 */
export function TasksTable(props: { projectId: string }) {
  const { setDetailPageList } = useDetailPageLists();

  const tasks = api.tasks.all.useQuery({
    projectId: props.projectId,
  });
  // const hasCUDAccess = useHasAccess({
  //   projectId: props.projectId,
  //   scope: "tasks:CUD",
  // });

  useEffect(() => {
    if (tasks.isSuccess) {
      setDetailPageList(
        "tasks",
        tasks.data.map((t) => encodeURIComponent(t.name)),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks.isSuccess, tasks.data]);

  const columns: LangfuseColumnDef<RowData>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => {
        const name: string = row.getValue("name");
        return name ? (
          <TableLink
            path={`/project/${props.projectId}/tasks/${encodeURIComponent(name)}`}
            value={name}
            truncateAt={50}
          />
        ) : undefined;
      },
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => {
        return row.getValue("description") != null ? (
          row.getValue("description")
        ) : (
          <em>No description set</em>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "Created At",
      cell: ({ row }) => {
        const createdAt: Date = row.getValue("createdAt");
        return createdAt.toLocaleString();
      },
    },
  ];

  const convertToTableRow = (
    item: RouterOutput["tasks"]["all"][number],
  ): RowData => {
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      createdAt: item.createdAt,
    };
  };

  return (
    <div>
      <DataTable
        columns={columns}
        data={
          tasks.isLoading
            ? { isLoading: true, isError: false }
            : tasks.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: tasks.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: tasks.data.map((t) => convertToTableRow(t)),
                }
        }
      />
    </div>
  );
}
