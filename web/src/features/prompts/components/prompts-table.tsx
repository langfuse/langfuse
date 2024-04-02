import { capitalize } from "lodash";
import { LockIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { Button } from "@/src/components/ui/button";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { DeletePrompt } from "@/src/features/prompts/components/delete-prompt";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import useProjectId from "@/src/hooks/useProjectId";
import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";

type RowData = {
  name: string;
  version: number;
  id: string;
  createdAt: Date;
  isActive: boolean;
  type: string;
  numberOfObservations: number;
};

export function PromptTable() {
  const projectId = useProjectId();
  const { setDetailPageList } = useDetailPageLists();

  const prompts = api.prompts.all.useQuery({
    projectId,
  });
  const hasCUDAccess = useHasAccess({
    projectId,
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

  const columns: LangfuseColumnDef<RowData>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => {
        const name: string = row.getValue("name");
        return name ? (
          <TableLink
            path={`/project/${projectId}/prompts/${encodeURIComponent(name)}`}
            value={name}
            truncateAt={50}
          />
        ) : undefined;
      },
    },
    {
      accessorKey: "version",
      header: "Latest Version",
      cell: ({ row }) => {
        const version = row.getValue("version");
        return version;
      },
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => {
        return capitalize(row.getValue("type"));
      },
    },
    {
      accessorKey: "createdAt",
      header: "Latest Version Created At",
      cell: ({ row }) => {
        const createdAt: Date = row.getValue("createdAt");
        return createdAt.toLocaleString();
      },
    },
    {
      accessorKey: "numberOfObservations",
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
            path={`/project/${projectId}/generations?filter=${numberOfObservations ? filter : ""}`}
            value={numberOfObservations.toLocaleString()}
          />
        );
      },
    },
    {
      accessorKey: "actions",
      header: "Actions",
      cell: ({ row }) => {
        return (
          <DeletePrompt
            projectId={projectId}
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
      type: item.type,
      isActive: item.isActive,
      numberOfObservations: Number(item.observationCount),
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
      <Link href={`/project/${projectId}/prompts/new`}>
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
      </Link>
    </div>
  );
}
