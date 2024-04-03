import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { Button } from "@/src/components/ui/button";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { CreatePromptDialog } from "@/src/features/prompts/components/new-prompt-button";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { DeletePrompt } from "@/src/features/prompts/components/delete-prompt";

import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import { LockIcon, PlusIcon } from "lucide-react";
import { useEffect } from "react";
import { TagPromptPopver } from "@/src/features/tag/components/TagPromptPopover";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { promptsTableColsWithOptions } from "@/src/server/api/definitions/promptsTable";

type RowData = {
  name: string;
  version: number;
  id: string;
  createdAt: Date;
  isActive: boolean;
  numberOfObservations: number;
  tags: string[];
};

export function PromptTable(props: { projectId: string }) {
  const { setDetailPageList } = useDetailPageLists();

  const hasCUDAccess = useHasAccess({
    projectId: props.projectId,
    scope: "prompts:CUD",
  });

  const [filterState, setFilterState] = useQueryFilterState([], "prompts");

  const [orderByState, setOrderByState] = useOrderByState({
    column: "createdAt",
    order: "DESC",
  });
  const prompts = api.prompts.all.useQuery({
    projectId: props.projectId,
    filter: filterState,
    orderBy: orderByState,
  });
  const promptFilterOptions = api.prompts.filterOptions.useQuery(
    {
      projectId: props.projectId,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  useEffect(() => {
    if (prompts.isSuccess) {
      setDetailPageList(
        "prompts",
        prompts.data.map((t) => encodeURIComponent(t.name)),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompts.isSuccess, prompts.data]);

  const columns: LangfuseColumnDef<RowData>[] = [
    {
      accessorKey: "name",
      id: "name",
      header: "Name",
      cell: ({ row }) => {
        const name: string = row.getValue("name");
        return name ? (
          <TableLink
            path={`/project/${props.projectId}/prompts/${encodeURIComponent(name)}`}
            value={name}
            truncateAt={50}
          />
        ) : undefined;
      },
      enableSorting: true,
    },
    {
      accessorKey: "version",
      id: "version",
      header: "Latest Version",
      cell: ({ row }) => {
        const version = row.getValue("version");
        return version;
      },
      enableSorting: true,
    },
    {
      accessorKey: "createdAt",
      id: "createdAt",
      header: "Latest Version Created At",
      cell: ({ row }) => {
        const createdAt: Date = row.getValue("createdAt");
        return createdAt.toLocaleString();
      },
      enableSorting: true,
    },
    {
      accessorKey: "numberOfObservations",
      id: "numberOfObservations",
      header: "Number of Generations",
      cell: ({ row }) => {
        const numberOfObservations: number = row.getValue(
          "numberOfObservations",
        );
        const name: string = row.getValue("name");
        const filter = encodeURIComponent(
          `Prompt Name;stringOptions;;any of;${name}`,
        );
        return (
          <TableLink
            path={`/project/${props.projectId}/generations?filter=${numberOfObservations ? filter : ""}`}
            value={numberOfObservations.toLocaleString()}
          />
        );
      },
      enableSorting: true,
    },
    {
      accessorKey: "tags",
      id: "tags",
      header: "Tags",
      cell: ({ row }) => {
        const tags: string[] = row.getValue("tags");
        const promptName: string = row.original.name;
        const filterOptionTags = promptFilterOptions.data?.tags ?? [];
        const allTags = filterOptionTags.map((t) => t.value);
        const projectId = props.projectId;
        return (
          <TagPromptPopver
            tags={tags}
            availableTags={allTags}
            projectId={props.projectId}
            promptName={promptName}
            promptsFilter={{
              ...filterOptionTags,
              projectId,
              filter: filterState,
              orderBy: orderByState,
            }}
          />
        );
      },
      enableHiding: true,
    },
    {
      accessorKey: "actions",
      header: "Actions",
      cell: ({ row }) => {
        return (
          <DeletePrompt
            projectId={props.projectId}
            promptName={row.getValue("name")}
          />
        );
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
      createdAt: item.createdAt,
      isActive: item.isActive,
      numberOfObservations: Number(item.observationCount),
      tags: item.tags,
    };
  };

  return (
    <div>
      <DataTableToolbar
        columns={columns}
        filterColumnDefinition={promptsTableColsWithOptions(
          promptFilterOptions.data,
        )}
        filterState={filterState}
        setFilterState={setFilterState}
      />
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
        orderBy={orderByState}
        setOrderBy={setOrderByState}
      />
      <CreatePromptDialog projectId={props.projectId} title="Create Prompt">
        <Button
          variant="secondary"
          className="mt-4"
          disabled={!hasCUDAccess}
          aria-label="Promote Prompt to Production"
        >
          {hasCUDAccess ? (
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
