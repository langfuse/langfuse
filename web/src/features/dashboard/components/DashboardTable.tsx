import { useEffect } from "react";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import { api } from "@/src/utils/api";
import { safeExtract } from "@/src/utils/map-utils";
import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { createColumnHelper } from "@tanstack/react-table";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createLinkTableColumn } from "@/src/components/design-system/table/columns/createLinkTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { User as UserIcon } from "lucide-react";
import { DashboardRowActions } from "@/src/features/dashboard/components/DashboardRowActions";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useRouter } from "next/router";

type DashboardTableRow = {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  owner: "PROJECT" | "LANGFUSE";
};

export function DashboardTable() {
  const projectId = useProjectIdFromURL() as string;
  const { setDetailPageList } = useDetailPageLists();
  const router = useRouter();

  const [orderByState, setOrderByState] = useOrderByState({
    column: "updatedAt",
    order: "DESC",
  });
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const dashboards = api.dashboard.allDashboards.useQuery(
    {
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
      projectId: projectId as string, // Typecast as query is enabled only when projectId is present
      orderBy: orderByState,
    },
    {
      enabled: Boolean(projectId),
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  useEffect(() => {
    if (dashboards.isSuccess) {
      setDetailPageList(
        "dashboards",
        dashboards.data?.dashboards.map((d) => ({ id: d.id })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboards.isSuccess, dashboards.data]);

  const columnHelper = createColumnHelper<DashboardTableRow>();
  const dashboardColumns = [
    createLinkTableColumn<DashboardTableRow>({
      accessorKey: "name",
      header: "Name",
      enableSorting: true,
      size: 200,
      getCell: (name, { row }) => {
        if (name) {
          return {
            type: "link",
            props: {
              path: `/project/${projectId}/dashboards/${encodeURIComponent(row.original.id)}`,
              value: name,
            },
          };
        }

        return undefined;
      },
    }),
    createTextTableColumn<DashboardTableRow>({
      accessorKey: "description",
      header: "Description",
      size: 300,
    }),
    columnHelper.display({
      id: "ownerTag",
      header: "Owner",
      size: 80,
      cell: (row) => {
        return row.row.original.owner === "LANGFUSE" ? (
          <span className="flex gap-1 px-2 py-0.5 text-xs">
            <span role="img" aria-label="Langfuse">
              🪢
            </span>
            Langfuse
          </span>
        ) : (
          <span className="flex gap-1 px-2 py-0.5 text-xs">
            <UserIcon className="h-3 w-3" /> Project
          </span>
        );
      },
    }),
    createDateTableColumn<DashboardTableRow>({
      accessorKey: "createdAt",
      header: "Created At",
      enableSorting: true,
      size: 150,
    }),
    createDateTableColumn<DashboardTableRow>({
      accessorKey: "updatedAt",
      header: "Updated At",
      enableSorting: true,
      size: 150,
    }),
    columnHelper.display({
      id: "actions",
      header: "Actions",
      size: 70,
      loadingCell: <Skeleton className="h-8 w-8 shrink-0 rounded-md" />,
      cell: ({ row }) => (
        <DashboardRowActions projectId={projectId} dashboard={row.original} />
      ),
    }),
  ] as LangfuseColumnDef<DashboardTableRow>[];

  return (
    <DataTable
      tableName="dashboards"
      columns={dashboardColumns}
      data={
        dashboards.isPending
          ? { isLoading: true, isError: false }
          : dashboards.isError
            ? {
                isLoading: false,
                isError: true,
                error: dashboards.error.message,
              }
            : {
                isLoading: false,
                isError: false,
                data: safeExtract(dashboards.data, "dashboards", []),
              }
      }
      orderBy={orderByState}
      setOrderBy={setOrderByState}
      pagination={{
        totalCount: dashboards.data?.totalCount ?? null,
        onChange: setPaginationState,
        state: paginationState,
      }}
      onRowClick={(row) => {
        router.push(
          `/project/${projectId}/dashboards/${encodeURIComponent(row.id)}`,
        );
      }}
      cellPadding="comfortable"
    />
  );
}
