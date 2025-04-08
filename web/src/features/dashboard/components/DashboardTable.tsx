import { useEffect } from "react";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import { api } from "@/src/utils/api";
import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { createColumnHelper } from "@tanstack/react-table";
import TableLink from "@/src/components/table/table-link";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";

type DashboardTableRow = {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
};

export function DashboardTable() {
  const projectId = useProjectIdFromURL();
  const { setDetailPageList } = useDetailPageLists();

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
    columnHelper.accessor("name", {
      header: "Name",
      id: "name",
      enableSorting: true,
      size: 200,
      cell: (row) => {
        const name = row.getValue();
        return name ? (
          <TableLink
            path={`/project/${projectId}/dashboards/${encodeURIComponent(row.row.original.id)}`}
            value={name}
          />
        ) : undefined;
      },
    }),
    columnHelper.accessor("description", {
      header: "Description",
      id: "description",
      size: 300,
      cell: (row) => {
        return row.getValue();
      },
    }),
    columnHelper.accessor("createdAt", {
      header: "Created At",
      id: "createdAt",
      enableSorting: true,
      size: 150,
      cell: (row) => {
        const createdAt = row.getValue();
        return <LocalIsoDate date={createdAt} />;
      },
    }),
    columnHelper.accessor("updatedAt", {
      header: "Updated At",
      id: "updatedAt",
      enableSorting: true,
      size: 150,
      cell: (row) => {
        const updatedAt = row.getValue();
        return <LocalIsoDate date={updatedAt} />;
      },
    }),
  ] as LangfuseColumnDef<DashboardTableRow>[];

  return (
    <DataTable
      columns={dashboardColumns}
      data={
        dashboards.isLoading
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
                data: dashboards.data.dashboards,
              }
      }
      orderBy={orderByState}
      setOrderBy={setOrderByState}
      pagination={{
        totalCount: dashboards.data?.totalCount ?? null,
        onChange: setPaginationState,
        state: paginationState,
      }}
    />
  );
}