import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { useHasProjectAccess } from "@/src/features/rbac";
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
import { Copy, Edit, Trash2, User as UserIcon } from "lucide-react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { DropdownMenuItem } from "@/src/components/ui/dropdown-menu";
import { DeleteDialogDashboardContent } from "@/src/features/dashboard/components/DeleteDialogDashboardContent";
import { EditDialogDashboardContent } from "@/src/features/dashboard/components/EditDialogDashboardContent";
import { CloneFirstDialogController } from "@/src/features/dashboard/components/CloneFirstDialogController";
import { useRouter } from "next/router";
import { DialogController } from "@/src/components/ui/dialog";

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
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({ projectId, scope: "dashboards:CUD" });
  const [selectedDashboard, setSelectedDashboard] =
    useState<DashboardTableRow | null>(null);
  const cloneDashboard = api.dashboard.cloneDashboard.useMutation({
    onSuccess: () => {
      utils.dashboard.invalidate();
      showSuccessToast({
        title: "Dashboard cloned",
        description: "The dashboard has been cloned successfully",
      });
    },
    onError: (error) => {
      showErrorToast("Failed to clone dashboard", error.message);
    },
  });

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
  ] as LangfuseColumnDef<DashboardTableRow>[];

  return (
    <CloneFirstDialogController
      projectId={projectId}
      dashboardId={selectedDashboard?.id ?? ""}
      dashboardName={selectedDashboard?.name ?? "Dashboard"}
    >
      {({ openDialog: openCloneFirstDialog }) => (
        <DialogController
          closeOnInteractionOutside={false}
          size="default"
          renderContent={({ closeDialog }) =>
            selectedDashboard ? (
              <EditDialogDashboardContent
                closeDialog={closeDialog}
                projectId={projectId}
                dashboardId={selectedDashboard.id}
                initialName={selectedDashboard.name}
                initialDescription={selectedDashboard.description}
              />
            ) : null
          }
        >
          {({ openDialog: openEditDialog }) => (
            <DialogController
              closeOnInteractionOutside={false}
              size="default"
              renderContent={({ closeDialog }) =>
                selectedDashboard ? (
                  <DeleteDialogDashboardContent
                    closeDialog={closeDialog}
                    projectId={projectId}
                    dashboardId={selectedDashboard.id}
                  />
                ) : null
              }
            >
              {({ openDialog: openDeleteDialog }) => (
                <DataTable
                  tableName="dashboards"
                  columns={[
                    ...dashboardColumns,
                    createDropdownTableColumn<DashboardTableRow, string>({
                      id: "actions",
                      accessorFn: (row) => row.id,
                      header: "Actions",
                      size: 70,
                      renderMenu: (id, { row }) => {
                        if (!id) return null;
                        const dashboard = row.original;

                        return (
                          <>
                            <DropdownMenuItem
                              disabled={!hasAccess}
                              onSelect={() => {
                                setSelectedDashboard(dashboard);
                                if (dashboard.owner === "PROJECT") {
                                  openEditDialog();
                                  return;
                                }

                                capture("dashboard:locked_edit_attempt", {
                                  dashboard_id: dashboard.id,
                                  attempt: "list_edit",
                                  surface: "list",
                                });
                                openCloneFirstDialog();
                              }}
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!hasAccess}
                              onSelect={() => {
                                cloneDashboard.mutate(
                                  {
                                    projectId,
                                    dashboardId: dashboard.id,
                                  },
                                  {
                                    onSuccess: () => {
                                      capture("dashboard:clone_dashboard", {
                                        source: "list_clone_button",
                                        dashboardId: dashboard.id,
                                        owner: dashboard.owner,
                                      });
                                    },
                                  },
                                );
                              }}
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              Clone
                            </DropdownMenuItem>
                            {dashboard.owner === "PROJECT" ? (
                              <DropdownMenuItem
                                className="text-destructive"
                                disabled={!hasAccess}
                                onSelect={() => {
                                  setSelectedDashboard(dashboard);
                                  capture(
                                    "dashboard:delete_dashboard_form_open",
                                  );
                                  openDeleteDialog();
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            ) : null}
                          </>
                        );
                      },
                    }),
                  ]}
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
                            data: safeExtract(
                              dashboards.data,
                              "dashboards",
                              [],
                            ),
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
              )}
            </DialogController>
          )}
        </DialogController>
      )}
    </CloneFirstDialogController>
  );
}
