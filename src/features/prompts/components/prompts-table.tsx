import { StatusBadge } from "@/src/components/layouts/live-badge";
import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { Button } from "@/src/components/ui/button";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { CreatePromptDialog } from "@/src/features/prompts/components/new-prompt-button";
import { PromotePrompt } from "@/src/features/prompts/components/promote-prompt";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";

import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import { LockIcon, PlusIcon } from "lucide-react";
import { useEffect } from "react";

type RowData = {
  id: string;
  name: string;
  version: number;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
};

export function PromptTable(props: { projectId: string }) {
  const { setDetailPageList } = useDetailPageLists();

  const prompts = api.prompts.all.useQuery({
    projectId: props.projectId,
  });

  const hasAccess = useHasAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });

  useEffect(() => {
    if (prompts.isSuccess) {
      setDetailPageList(
        "prompts",
        prompts.data.map((t) => t.id),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompts.isSuccess, prompts.data]);

  const columns: LangfuseColumnDef<RowData>[] = [
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => {
        const isActive = row.getValue("isActive");
        return isActive ? (
          <StatusBadge type="live" className="h-6 w-24" />
        ) : (
          <StatusBadge type="disabled" className="h-6 w-24" />
        );
      },
    },
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
      accessorKey: "createdBy",
      header: "Created By",
      cell: ({ row }) => {
        const createdBy = row.getValue("createdBy");
        return createdBy;
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
    {
      accessorKey: "action",
      header: "Action",
      cell: ({ row }) => {
        const promptId = row.getValue("id");
        const promptName = row.getValue("name");
        const isActive = row.getValue("isActive");
        return promptId &&
          typeof promptId === "string" &&
          isActive !== undefined &&
          typeof isActive === "boolean" &&
          promptName &&
          typeof promptName === "string" ? (
          <PromotePrompt
            promptId={promptId}
            projectId={props.projectId}
            promptName={promptName}
            disabled={isActive}
          />
        ) : undefined;
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
      createdAt: item.createdAt,
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
      <CreatePromptDialog projectId={props.projectId} title="Create Prompt">
        <Button variant="secondary" className="mt-4" disabled={!hasAccess}>
          {hasAccess ? (
            <PlusIcon className="-ml-0.5 mr-1.5" aria-hidden="true" />
          ) : (
            <LockIcon className="-ml-0.5 mr-1.5 h-3 w-3" aria-hidden="true" />
          )}
          New prompt
        </Button>
      </CreatePromptDialog>
    </div>
  );
}
