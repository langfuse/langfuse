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
import { createColumnHelper } from "@tanstack/react-table";

type PromptTableRow = {
  name: string;
  version: number;
  id: string;
  createdAt: Date;
  isActive: boolean;
  numberOfObservations: number;
};

export function PromptTable(props: { projectId: string }) {
  const { setDetailPageList } = useDetailPageLists();

  const prompts = api.prompts.all.useQuery({
    projectId: props.projectId,
  });
  const hasCUDAccess = useHasAccess({
    projectId: props.projectId,
    scope: "prompts:CUD",
  });

  useEffect(() => {
    if (prompts.isSuccess) {
      setDetailPageList(
        "prompts",
        prompts.data.map((t) => encodeURIComponent(t.name)),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompts.isSuccess, prompts.data]);

  const columnHelper = createColumnHelper<PromptTableRow>();
  const promptColumns = [
    columnHelper.accessor("name", {
      header: "Name",
      cell: (row) => {
        const name = row.getValue();
        return name ? (
          <TableLink
            path={`/project/${props.projectId}/prompts/${encodeURIComponent(name)}`}
            value={name}
            truncateAt={50}
          />
        ) : undefined;
      },
    }),
    columnHelper.accessor("version", { header: "Latest Version" }),
    columnHelper.accessor("createdAt", {
      header: "Latest Version Created At",
      cell: (info) => {
        const createdAt = info.getValue();
        return createdAt.toLocaleString();
      },
    }),
    columnHelper.accessor("numberOfObservations", {
      header: "Number of Generations",
      cell: (info) => {
        const numberOfObservations = info.getValue();
        const name = info.row.original.name;
        const filter = encodeURIComponent(
          `promptName;stringOptions;;any of;${name}`,
        );
        return (
          <TableLink
            path={`/project/${props.projectId}/generations?filter=${numberOfObservations ? filter : ""}`}
            value={numberOfObservations.toLocaleString()}
          />
        );
      },
    }),
    columnHelper.display({
      id: "actions",
      header: "Actions",
      cell: (row) => {
        const name = row.row.original.name;
        return <DeletePrompt projectId={props.projectId} promptName={name} />;
      },
    }),
  ] as LangfuseColumnDef<PromptTableRow>[];

  // https://github.com/TanStack/table/issues/4302#issuecomment-1883209783

  const convertToTableRow = (
    item: RouterOutput["prompts"]["all"][number],
  ): PromptTableRow => {
    return {
      id: item.id,
      name: item.name,
      version: item.version,
      createdAt: item.createdAt,
      isActive: item.isActive,
      numberOfObservations: Number(item.observationCount),
    };
  };

  return (
    <div>
      <DataTable
        columns={promptColumns}
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
