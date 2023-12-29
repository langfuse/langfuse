import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { CreatePromptButton } from "@/src/features/prompts/components/new-prompt-button";

import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";

type RowData = {
  id: string;
  name: string;
  version: number;
  isActive: boolean;
  createdBy?: string;
};

export function PromptTable(props: { projectId: string }) {
  const prompts = api.prompts.all.useQuery({
    projectId: props.projectId,
  });

  const columns: LangfuseColumnDef<RowData>[] = [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => {
        const value = row.getValue("id");
        return value && typeof value === "string" ? (
          <TableLink
            path={`/project/${props.projectId}/prompts/${value}`}
            value={value}
          />
        ) : undefined;
      },
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => {
        const name = row.getValue("name");
        return name;
      },
    },
    {
      accessorKey: "version",
      header: "Version",
      cell: ({ row }) => {
        const version = row.getValue("version");
        return version;
      },
    },
    {
      accessorKey: "isActive",
      header: "Active",
      cell: ({ row }) => {
        const isActive = row.getValue("isActive");
        return isActive ? "Yes" : "No";
      },
    },
    {
      accessorKey: "createdBy",
      header: "Created By",
      cell: ({ row }) => {
        const createdBy = row.getValue("createdBy");
        return createdBy;
      },
    },
  ];

  const convertToTableRow = (
    item: RouterOutput["prompts"]["all"][number],
  ): RowData => {
    return {
      id: item.id,
      name: item.name,
      version: item.version,
      isActive: item.isActive,
      createdBy: item.createdBy,
    };
  };

  return (
    <div>
      <DataTable
        columns={columns}
        data={
          prompts.isLoading
            ? { isLoading: true, isError: false }
            : prompts.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: prompts.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: prompts.data.map((t) => convertToTableRow(t)),
                }
        }
      />
      <CreatePromptButton projectId={props.projectId} className="mt-4" />
    </div>
  );
}
