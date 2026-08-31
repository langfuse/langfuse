import { useEffect, useState } from "react";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import { api } from "@/src/utils/api";
import { safeExtract } from "@/src/utils/map-utils";
import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { createColumnHelper } from "@tanstack/react-table";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createDropdownTableColumn } from "@/src/components/design-system/table/columns/createDropdownTableColumn";
import { createLinkTableColumn } from "@/src/components/design-system/table/columns/createLinkTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { Button } from "@/src/components/ui/button";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Copy, Edit, User as UserIcon } from "lucide-react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { DropdownMenuItem } from "@/src/components/ui/dropdown-menu";
import { DeleteDashboardButton } from "@/src/components/deleteButton";
import { EditDashboardDialog } from "@/src/features/dashboard/components/EditDashboardDialog";
import { CloneFirstDialog } from "@/src/features/dashboard/components/CloneFirstDialog";
import { useRouter } from "next/router";

type DashboardTableRow = {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  owner: "PROJECT" | "LANGFUSE";
};

const dashboardMenuButtonWrapperClassName = "w-full";
const dashboardMenuButtonClassName = "w-full justify-start";

function CloneDashboardButton({
  dashboardId,
  projectId,
  owner,
}: {
  dashboardId: string;
  projectId: string;
  owner: DashboardTableRow["owner"];
}) {
  const utils = api.useUtils();
  const hasAccess = useHasProjectAccess({ projectId, scope: "dashboards:CUD" });
  const capture = usePostHogClientCapture();

  const mutCloneDashboard = api.dashboard.cloneDashboard.useMutation({
    onSuccess: () => {
      utils.dashboard.invalidate();
      capture("dashboard:clone_dashboard", {
        source: "list_clone_button",
        dashboardId,
        owner,
      });
      showSuccessToast({
        title: "Dashboard cloned",
        description: "The dashboard has been cloned successfully",
      });
    },
    onError: (e) => {
      showErrorToast("Failed to clone dashboard", e.message);
    },
  });

  const handleCloneDashboard = () => {
    if (!projectId) {
      console.error("Project ID is missing");
      return;
    }

    mutCloneDashboard.mutateAsync({
      projectId,
      dashboardId,
    });
  };

  return (
    <div className={dashboardMenuButtonWrapperClassName}>
      <Button
        variant="ghost"
        size="default"
        className={dashboardMenuButtonClassName}
        disabled={!hasAccess}
        onClick={handleCloneDashboard}
      >
        <Copy className="mr-2 h-4 w-4" />
        Clone
      </Button>
    </div>
  );
}

function EditDashboardButton({
  dashboardId,
  projectId,
  dashboardName,
  dashboardDescription,
}: {
  dashboardId: string;
  projectId: string;
  dashboardName: string;
  dashboardDescription: string;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const hasAccess = useHasProjectAccess({ projectId, scope: "dashboards:CUD" });

  return (
    <div className={dashboardMenuButtonWrapperClassName}>
      <Button
        variant="ghost"
        size="default"
        className={dashboardMenuButtonClassName}
        disabled={!hasAccess}
        onClick={() => setIsDialogOpen(true)}
      >
        <Edit className="mr-2 h-4 w-4" />
        Edit
      </Button>

      <EditDashboardDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        projectId={projectId}
        dashboardId={dashboardId}
        initialName={dashboardName}
        initialDescription={dashboardDescription}
      />
    </div>
  );
}

function LockedEditDashboardButton({
  dashboardId,
  projectId,
  dashboardName,
}: {
  dashboardId: string;
  projectId: string;
  dashboardName: string;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const hasAccess = useHasProjectAccess({ projectId, scope: "dashboards:CUD" });
  const capture = usePostHogClientCapture();

  return (
    <div className={dashboardMenuButtonWrapperClassName}>
      <Button
        variant="ghost"
        size="default"
        className={dashboardMenuButtonClassName}
        disabled={!hasAccess}
        onClick={() => {
          capture("dashboard:locked_edit_attempt", {
            dashboard_id: dashboardId,
            attempt: "list_edit",
            surface: "list",
          });
          setIsDialogOpen(true);
        }}
      >
        <Edit className="mr-2 h-4 w-4" />
        Edit
      </Button>

      <CloneFirstDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        projectId={projectId}
        dashboardId={dashboardId}
        dashboardName={dashboardName}
      />
    </div>
  );
}

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
    createDropdownTableColumn<DashboardTableRow, string>({
      id: "actions",
      accessorFn: (row) => row.id,
      header: "Actions",
      size: 70,
      renderMenu: (id, { row }) => {
        if (!id) return null;
        const { name, description, owner } = row.original;
        return (
          <>
            {owner === "PROJECT" ? (
              <DropdownMenuItem className="w-full p-0">
                <EditDashboardButton
                  dashboardId={id}
                  projectId={projectId}
                  dashboardName={name}
                  dashboardDescription={description}
                />
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem className="w-full p-0">
                <LockedEditDashboardButton
                  dashboardId={id}
                  projectId={projectId}
                  dashboardName={name}
                />
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="w-full p-0">
              <CloneDashboardButton
                dashboardId={id}
                projectId={projectId}
                owner={owner}
              />
            </DropdownMenuItem>
            {owner === "PROJECT" ? (
              <DropdownMenuItem
                className="w-full p-0"
                onSelect={(event) => {
                  event.preventDefault();
                }}
              >
                <div className={dashboardMenuButtonWrapperClassName}>
                  <DeleteDashboardButton
                    itemId={id}
                    projectId={projectId}
                    isTableAction
                    className={dashboardMenuButtonClassName}
                  />
                </div>
              </DropdownMenuItem>
            ) : null}
          </>
        );
      },
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
