import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { CreateBotDialog } from "@/src/features/bots/components/new-bots-button";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import { useEffect } from "react";
import { LockIcon, PlusIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";

type RowData = {
  name: string;
  id: string;
  version: number;
  numberOfObservations: number;
  createdAt: Date;
  description: string | null;
  taskName: string;
};

export function BotsTable(props: { projectId: string }) {
  const { setDetailPageList } = useDetailPageLists();

  const bots = api.bots.all.useQuery({
    projectId: props.projectId,
  });
  const hasCUDAccess = useHasAccess({
    projectId: props.projectId,
    scope: "bots:CUD",
  });

  useEffect(() => {
    if (bots.isSuccess) {
      setDetailPageList(
        "bots",
        bots.data.map((t) => encodeURIComponent(t.name)),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bots.isSuccess, bots.data]);

  const columns: LangfuseColumnDef<RowData>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => {
        const name: string = row.getValue("name");
        return name ? (
          <TableLink
            path={`/project/${props.projectId}/bots/${encodeURIComponent(name)}`}
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
      accessorKey: "task",
      header: "Task",
      cell: ({ row }) => {
        return row.getValue("taskName") != null ? (
          row.getValue("taskName")
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
    {
      accessorKey: "numberOfObservations",
      header: "Number of Generations",
      cell: ({ row }) => {
        const numberOfObservations: number = row.getValue(
          "numberOfObservations",
        );
        const name: string = row.getValue("name");
        const filter = encodeURIComponent(
          `Bot Name;stringOptions;;any of;${name}`,
        );
        return (
          <TableLink
            path={`/project/${props.projectId}/generations?filter=${numberOfObservations ? filter : ""}`}
            value={numberOfObservations.toLocaleString()}
          />
        );
      },
    },
  ];

  const convertToTableRow = (
    item: RouterOutput["bots"]["all"][number],
  ): RowData => {
    return {
      id: item.id,
      name: item.name,
      version: item.version,
      numberOfObservations: Number(item.observationCount),
      description: item.description,
      createdAt: item.createdAt,
      taskName: item.taskName,
    };
  };

  return (
    <div>
      <DataTable
        columns={columns}
        data={
          bots.isLoading
            ? { isLoading: true, isError: false }
            : bots.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: bots.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: bots.data.map((t) => convertToTableRow(t)),
                }
        }
      />
      <CreateBotDialog projectId={props.projectId} title="Create Bot">
        <Button variant="secondary" className="mt-4" disabled={!hasCUDAccess}>
          {hasCUDAccess ? (
            <PlusIcon className="-ml-0.5 mr-1.5" aria-hidden="true" />
          ) : (
            <LockIcon className="-ml-0.5 mr-1.5 h-3 w-3" aria-hidden="true" />
          )}
          New Bot
        </Button>
      </CreateBotDialog>
    </div>
  );
}
