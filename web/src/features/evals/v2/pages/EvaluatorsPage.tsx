import { formatDistanceToNowStrict } from "date-fns";
import { TableViewPresetTableName, ZodModelConfig } from "@langfuse/shared";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/router";
import { type ComponentProps, useMemo, useState } from "react";
import { StringParam, useQueryParam, withDefault } from "use-query-params";
import { useStore } from "zustand";
import Page from "@/src/components/layouts/page";
import { DataTable } from "@/src/components/table/data-table";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import {
  DataTableControls,
  DataTableControlsProvider,
} from "@/src/components/table/data-table-controls";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { Button } from "@/src/components/ui/button";
import { EvaluatorsEmptyState } from "../components/EvaluatorsEmptyState/EvaluatorsEmptyState";
import { PopoverTrigger } from "@/src/components/ui/popover";
import { Skeleton } from "@/src/components/ui/skeleton";
import { EvaluatorActionsCell } from "../components/Evaluators/EvaluatorActionsCell/EvaluatorActionsCell";
import { EvaluatorBulkDeleteDialog } from "../components/Evaluators/EvaluatorBulkDeleteDialog/EvaluatorBulkDeleteDialog";
import { EvaluatorGalleryDialog } from "../components/EvaluatorGalleryDialog/EvaluatorGalleryDialog";
import { EvaluatorRuleRelationshipsSheet } from "@/src/features/evals/v2/components/Rules/EvaluatorRuleRelationships/EvaluatorRuleRelationships";
import { EvaluatorStatusBadge } from "../components/Evaluators/EvaluatorStatusBadge/EvaluatorStatusBadge";
import { EvaluatorTypeBadge } from "../components/Evaluators/EvaluatorTypeBadge/EvaluatorTypeBadge";
import { EvaluatorExecutionHistory } from "@/src/features/evals/v2/components/Rules/EvaluatorExecutionHistory/EvaluatorExecutionHistory";
import { OverviewSelectionBar } from "../components/OverviewSelectionBar/OverviewSelectionBar";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { usePaginationState } from "@/src/hooks/usePaginationState";
import { useSidebarFilterState } from "@/src/features/filters/hooks/useSidebarFilterState";
import { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import {
  createEvaluatorsTableStore,
  type EvaluatorsTableStore,
} from "../store/evaluatorsTableStore";
import { api, type RouterOutputs } from "@/src/utils/api";
import { usdFormatter } from "@/src/utils/numbers";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import {
  evaluatorExecutionsUrl,
  evaluatorScoresUrl,
} from "../fns/evaluators/evaluatorScoresUrl";
import {
  EVALS_V2_TABS,
  getEvalsV2Tabs,
} from "@/src/features/navigation/utils/evals-v2-tabs";
import { DefaultModelChangeConfirmationDialog } from "../components/Evaluators/ProjectDefaultModel/DefaultModelChangeConfirmationDialog";
import { useProjectDefaultModel } from "@/src/features/evals/v2/hooks/useProjectDefaultModel";
import {
  JudgeModelPicker,
  JudgeModelPickerTrigger,
} from "../components/Evaluators/JudgeModelPicker/JudgeModelPicker";
import { JudgeModelConfigurationDialog } from "../components/Evaluators/JudgeModelConfigurationDialog/JudgeModelConfigurationDialog";
import {
  evaluatorTableFilterColumns,
  evaluatorTableFilterConfig,
  evaluatorTableFilterOptions,
} from "../constants/tableFilterColumns";
import type { GalleryTemplate } from "../types/templateGallery";

type EvaluatorRow = RouterOutputs["evalsV2"]["list"]["evaluators"][number];

function evaluatorCreateHref(projectId: string, template: GalleryTemplate) {
  return template.source === "managed"
    ? `/project/${projectId}/evals/new?template=${encodeURIComponent(template.key)}`
    : `/project/${projectId}/evals/new?evaluatorId=${encodeURIComponent(template.id)}`;
}

function RelativeDate({ date }: { date: Date }) {
  return (
    <span className="text-muted-foreground" title={date.toLocaleString()}>
      {formatDistanceToNowStrict(date, { addSuffix: true })}
    </span>
  );
}

function EvaluatorsOverviewSelectionBar({
  selectionStore,
  totalCount,
  onDeleteSelection,
}: {
  selectionStore: EvaluatorsTableStore;
  totalCount: number | null;
  onDeleteSelection: (selection: {
    selectAll: boolean;
    selectedIds: string[];
  }) => void;
}) {
  const rowSelection = useStore(selectionStore, (state) => state.rowSelection);
  const selectAll = useStore(selectionStore, (state) => state.selectAll);
  const selectedIds = Object.keys(rowSelection).filter(
    (id) => rowSelection[id],
  );

  return (
    <OverviewSelectionBar
      selectedCount={
        selectAll ? (totalCount ?? selectedIds.length) : selectedIds.length
      }
      onClear={selectionStore.getState().actions.clearSelection}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8"
        onClick={() => onDeleteSelection({ selectAll, selectedIds })}
      >
        <Trash2 className="h-4 w-4 sm:mr-2" />
        <span className="hidden sm:inline">Delete</span>
      </Button>
    </OverviewSelectionBar>
  );
}

function EvaluatorsTableToolbar({
  selectionStore,
  pageRowIds,
  pageSize,
  pageIndex,
  totalCount,
  ...toolbarProps
}: Omit<
  ComponentProps<typeof DataTableToolbar<EvaluatorRow, unknown>>,
  "multiSelect"
> & {
  selectionStore: EvaluatorsTableStore;
  pageRowIds: string[];
  pageSize: number;
  pageIndex: number;
  totalCount: number | null;
}) {
  const rowSelection = useStore(selectionStore, (state) => state.rowSelection);
  const selectAll = useStore(selectionStore, (state) => state.selectAll);
  const selectionActions = selectionStore.getState().actions;
  const selectedPageRowIds = pageRowIds.filter((id) => rowSelection[id]);

  return (
    <DataTableToolbar
      {...toolbarProps}
      multiSelect={{
        selectAll,
        setSelectAll: selectionActions.setSelectAll,
        selectedRowIds: selectedPageRowIds,
        setRowSelection: selectionActions.setRowSelection,
        pageSize,
        pageIndex,
        totalCount,
      }}
    />
  );
}

export default function EvaluatorsPage() {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const projectId = router.query.projectId as string;
  const [pagination, setPagination] = usePaginationState(1, 50);
  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "evaluatorsV2",
    "s",
  );
  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );
  const [selectionStore] = useState(() => createEvaluatorsTableStore());
  const filterOptionsQuery = api.evalsV2.filterOptions.useQuery(
    { projectId },
    {
      enabled: Boolean(projectId),
      refetchOnWindowFocus: false,
      staleTime: Infinity,
    },
  );
  const filterOptions = useMemo(
    () => ({
      ...evaluatorTableFilterOptions,
      name: filterOptionsQuery.data?.name ?? [],
      creator: filterOptionsQuery.data?.creator ?? [],
    }),
    [filterOptionsQuery.data],
  );
  const queryFilter = useSidebarFilterState(
    evaluatorTableFilterConfig,
    filterOptions,
    {
      loading: filterOptionsQuery.isPending,
      stateLocation: "urlAndSessionStorage",
      sessionFilterContextId: projectId,
      onExplicitFilterStateChange: () => {
        setPagination({ page: 1, limit: pagination.limit });
        selectionStore.getState().actions.clearSelection();
      },
    },
  );
  const filterState = queryFilter.filterState;
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [deleteAll, setDeleteAll] = useState(false);
  const [gallery, setGallery] = useQueryParam(
    "gallery",
    withDefault(StringParam, null),
  );
  const galleryOpen = gallery === "open";
  const setGalleryOpen = (open: boolean) => {
    setGallery(open ? "open" : null, "replaceIn");
  };
  const [defaultModelPickerOpen, setDefaultModelPickerOpen] = useState(false);
  const [defaultModelConfigurationOpen, setDefaultModelConfigurationOpen] =
    useState(false);
  const [attachEvaluatorId, setAttachEvaluatorId] = useState<string | null>(
    null,
  );
  const evaluators = api.evalsV2.list.useQuery(
    {
      projectId,
      ...pagination,
      search: searchQuery ?? undefined,
      filter: filterState,
    },
    { enabled: Boolean(projectId) },
  );
  const evaluatorIds = useMemo(
    () => evaluators.data?.evaluators.map(({ id }) => id) ?? [],
    [evaluators.data?.evaluators],
  );
  const selectedRuleEvaluator = evaluators.data?.evaluators.find(
    ({ id }) => id === attachEvaluatorId,
  );
  const showOnboarding =
    evaluators.isSuccess &&
    evaluators.data.totalItems === 0 &&
    !searchQuery &&
    filterState.length === 0;
  const hasExecutionReadAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:read",
  });
  const projectDefaultModel = useProjectDefaultModel({
    projectId,
    source: "overview",
  });
  const defaultModelConnection = projectDefaultModel.connections.find(
    ({ provider }) => provider === projectDefaultModel.defaultModel?.provider,
  );
  const parsedDefaultModelParams = ZodModelConfig.safeParse(
    projectDefaultModel.defaultModel?.modelParams,
  );
  const defaultModelConfig =
    projectDefaultModel.defaultModel && defaultModelConnection
      ? {
          provider: projectDefaultModel.defaultModel.provider,
          model: projectDefaultModel.defaultModel.model,
          adapter: defaultModelConnection.adapter,
          modelParams: parsedDefaultModelParams.success
            ? parsedDefaultModelParams.data
            : {},
        }
      : null;
  const costs = api.evalsV2.costByEvaluatorIds.useQuery(
    { projectId, evaluatorIds },
    {
      enabled: hasExecutionReadAccess && evaluatorIds.length > 0,
      meta: { silentHttpCodes: [503] },
    },
  );
  const recentExecutions = api.evalsV2.recentExecutions.useQuery(
    { projectId, evaluatorIds },
    {
      enabled: hasExecutionReadAccess && evaluatorIds.length > 0,
      meta: { silentHttpCodes: [503] },
    },
  );
  const utils = api.useUtils();
  const deleteMany = api.evalsV2.deleteMany.useMutation({
    onError: trpcErrorToast,
    onSuccess: async () => {
      selectionStore.getState().actions.clearSelection();
      setDeleteIds([]);
      setDeleteAll(false);
      const deletedCount = deleteAll
        ? (evaluators.data?.totalItems ?? 0)
        : deleteIds.length;
      capture("evaluators:delete", {
        source: "overview",
        evaluatorCount: deletedCount,
        isAllMatching: deleteAll,
      });
      showSuccessToast({
        title: "Evaluators deleted",
        description: `${deletedCount} evaluator${deletedCount === 1 ? "" : "s"} deleted.`,
      });
      await Promise.all([
        utils.evalsV2.list.invalidate({ projectId }),
        utils.evalsV2.filterOptions.invalidate({ projectId }),
      ]);
    },
  });

  const { selectActionColumn } = TableSelectionManager<EvaluatorRow>({
    projectId,
    tableName: "evaluators-v2",
    setSelectedRows: selectionStore.getState().actions.setRowSelection,
    setSelectAll: selectionStore.getState().actions.setSelectAll,
    selectionStore,
  });
  const columns = useMemo<LangfuseColumnDef<EvaluatorRow>[]>(
    () => [
      selectActionColumn,
      {
        accessorKey: "name",
        id: "name",
        header: "Name",
        size: 320,
        isFixedPosition: true,
        cell: ({ row }) => (
          <span className="block truncate font-bold" title={row.original.name}>
            {row.original.name}
          </span>
        ),
      },
      {
        accessorKey: "status",
        id: "status",
        header: "Status",
        size: 130,
        enableHiding: true,
        cell: ({ row }) => (
          <EvaluatorStatusBadge
            ruleCount={row.original._count.assignments}
            active={row.original.hasActiveRules}
            blocked={Boolean(row.original.blockedAt)}
            blockReason={row.original.blockReason}
            blockMessage={row.original.blockMessage}
          />
        ),
      },
      {
        accessorKey: "executionTraces",
        id: "executionTraces",
        header: "Last 5 runs",
        size: 130,
        enableHiding: true,
        cell: ({ row }) => {
          if (recentExecutions.isPending && hasExecutionReadAccess) {
            return <Skeleton className="h-4 w-16" />;
          }
          const history = (
            <EvaluatorExecutionHistory
              traces={recentExecutions.data?.[row.original.id] ?? []}
            />
          );
          return hasExecutionReadAccess ? (
            <button
              type="button"
              className="focus-visible:ring-ring rounded-sm focus-visible:ring-2 focus-visible:outline-none"
              aria-label={`View executions for ${row.original.name}`}
              onClick={() =>
                router.push(
                  evaluatorExecutionsUrl(
                    projectId,
                    row.original.id,
                    row.original.type,
                  ),
                )
              }
            >
              {history}
            </button>
          ) : (
            history
          );
        },
      },
      {
        accessorKey: "type",
        id: "type",
        header: "Type",
        size: 160,
        enableHiding: true,
        cell: ({ row }) => <EvaluatorTypeBadge type={row.original.type} />,
      },
      {
        accessorKey: "totalCost",
        id: "totalCost",
        header: "Total cost (7d)",
        size: 140,
        enableHiding: true,
        cell: ({ row }) => {
          if (costs.isPending && hasExecutionReadAccess) {
            return <Skeleton className="h-4 w-16" />;
          }
          const cost = costs.data?.[row.original.id];
          return cost == null ? "—" : usdFormatter(cost, 2, 4);
        },
      },
      {
        accessorKey: "createdByUser",
        id: "createdByUser",
        header: "Created by",
        size: 180,
        enableHiding: true,
        cell: ({ row }) => {
          const creator =
            row.original.createdByUser?.name ??
            row.original.createdByUser?.email ??
            "API";
          return (
            <span className="block truncate" title={creator}>
              {creator}
            </span>
          );
        },
      },
      {
        accessorKey: "createdAt",
        id: "createdAt",
        header: "Created at",
        size: 180,
        enableHiding: true,
        defaultHidden: true,
        cell: ({ row }) => <RelativeDate date={row.original.createdAt} />,
      },
      {
        accessorKey: "updatedAt",
        id: "updatedAt",
        header: "Updated at",
        size: 180,
        enableHiding: true,
        cell: ({ row }) => <RelativeDate date={row.original.updatedAt} />,
      },
      {
        accessorKey: "actions",
        id: "actions",
        header: "Actions",
        size: 170,
        isFixedPosition: true,
        enableSorting: false,
        enableResizing: false,
        cell: ({ row }) => (
          <div className="w-full" onClick={(event) => event.stopPropagation()}>
            <EvaluatorActionsCell
              hasActiveRules={row.original.hasActiveRules}
              canViewExecutions={hasExecutionReadAccess}
              onViewScores={() =>
                router.push(evaluatorScoresUrl(projectId, row.original.name))
              }
              onViewExecutions={() =>
                router.push(
                  evaluatorExecutionsUrl(
                    projectId,
                    row.original.id,
                    row.original.type,
                  ),
                )
              }
              onManageRules={() => setAttachEvaluatorId(row.original.id)}
              onEdit={() =>
                router.push(`/project/${projectId}/evals/${row.original.id}`)
              }
              onDelete={() => setDeleteIds([row.original.id])}
            />
          </div>
        ),
      },
    ],
    [
      costs.data,
      costs.isPending,
      hasExecutionReadAccess,
      projectId,
      recentExecutions.data,
      recentExecutions.isPending,
      router,
      selectActionColumn,
    ],
  );
  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<EvaluatorRow>("evaluatorsV2ColumnVisibility", columns);
  const [columnOrder, setColumnOrder] = useColumnOrder<EvaluatorRow>(
    "evaluatorsV2ColumnOrder-v2",
    columns,
  );
  const { isLoading: isViewLoading, ...viewControllers } = useTableViewManager({
    tableName: TableViewPresetTableName.Evaluators,
    projectId,
    stateUpdaters: {
      setFilters: (filters) =>
        queryFilter.setFilterState(filters, { origin: "saved_view" }),
      setExpandedFilters: queryFilter.onExpandedChange,
      setSearchQuery: (query) => {
        setSearchQuery(query);
        setPagination({ page: 1, limit: pagination.limit });
        selectionStore.getState().actions.clearSelection();
      },
      setColumnOrder,
      setColumnVisibility,
    },
    validationContext: {
      columns,
      filterColumnDefinition: evaluatorTableFilterColumns,
      expandableFilterColumns: evaluatorTableFilterConfig.facets.map(
        (facet) => facet.column,
      ),
    },
    currentFilterState: queryFilter.explicitFilterState,
    currentExpandedFilters: queryFilter.expanded,
  });

  return (
    <Page
      scrollable={showOnboarding}
      headerProps={{
        title: "Evaluators",
        help: {
          description:
            "Create reusable evaluator definitions and test them before activation.",
        },
        actionButtonsRight: (
          <div className="flex gap-2">
            {showOnboarding ? null : (
              <JudgeModelPicker
                purpose="projectDefault"
                open={defaultModelPickerOpen}
                defaultModel={projectDefaultModel.defaultModel}
                providerGroups={projectDefaultModel.providerGroups}
                onOpenChange={setDefaultModelPickerOpen}
                onSelectProjectDefault={(model) => {
                  const connection = projectDefaultModel.connections.find(
                    ({ provider }) => provider === model.provider,
                  );
                  if (!connection) return;
                  projectDefaultModel.update.requestUpdate({
                    ...model,
                    adapter: connection.adapter,
                    modelParams: {},
                  });
                }}
                onConfigureProviders={projectDefaultModel.openProviderSettings}
                onConfigureModel={() => setDefaultModelConfigurationOpen(true)}
              >
                <PopoverTrigger asChild>
                  <JudgeModelPickerTrigger
                    mode="default"
                    defaultModel={projectDefaultModel.defaultModel}
                    selectedModel={null}
                    missingDefaultLabel="Set project default model"
                    loading={projectDefaultModel.update.isPending}
                    loadingText="Setting model..."
                    disabled={
                      !projectDefaultModel.canUpdate ||
                      !projectDefaultModel.canRead ||
                      projectDefaultModel.connectionsPending ||
                      projectDefaultModel.update.isPending
                    }
                  />
                </PopoverTrigger>
              </JudgeModelPicker>
            )}
            {showOnboarding ? (
              <Button variant="outline" onClick={() => setGalleryOpen(true)}>
                New evaluator
              </Button>
            ) : (
              <Button onClick={() => setGalleryOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New evaluator
              </Button>
            )}
          </div>
        ),
        tabsProps: {
          tabs: getEvalsV2Tabs(projectId),
          activeTab: EVALS_V2_TABS.EVALUATORS,
        },
      }}
    >
      {showOnboarding ? (
        <EvaluatorsEmptyState
          onSelectTemplate={(template) => {
            router.push(evaluatorCreateHref(projectId, template));
          }}
          onBrowseLibrary={() => setGalleryOpen(true)}
        />
      ) : (
        <DataTableControlsProvider
          tableName={evaluatorTableFilterConfig.tableName}
        >
          <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
            <EvaluatorsTableToolbar
              selectionStore={selectionStore}
              pageRowIds={evaluatorIds}
              pageSize={pagination.limit}
              pageIndex={pagination.page - 1}
              totalCount={evaluators.data?.totalItems ?? null}
              columns={columns}
              columnVisibility={columnVisibility}
              setColumnVisibility={setColumnVisibility}
              columnOrder={columnOrder}
              setColumnOrder={setColumnOrder}
              rowHeight={rowHeight}
              setRowHeight={setRowHeight}
              filterState={filterState}
              currentSearchQuery={searchQuery ?? undefined}
              viewConfig={{
                tableName: TableViewPresetTableName.Evaluators,
                projectId,
                controllers: viewControllers,
              }}
              searchConfig={{
                metadataSearchFields: ["Name"],
                updateQuery: (query) => {
                  setSearchQuery(query || null);
                  setPagination({ page: 1, limit: pagination.limit });
                  selectionStore.getState().actions.clearSelection();
                },
                currentQuery: searchQuery ?? undefined,
                tableAllowsFullTextSearch: false,
              }}
            />
            <ResizableFilterLayout>
              <DataTableControls
                key={viewControllers.selectedViewId ?? "no-view"}
                queryFilter={queryFilter}
              />
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <DataTable
                  tableName="evaluators-v2-overview-v2"
                  columns={columns}
                  data={
                    evaluators.isPending || isViewLoading
                      ? { isLoading: true, isError: false }
                      : evaluators.isError
                        ? {
                            isLoading: false,
                            isError: true,
                            error: evaluators.error.message,
                          }
                        : {
                            isLoading: false,
                            isError: false,
                            data: evaluators.data.evaluators,
                          }
                  }
                  pagination={{
                    totalCount: evaluators.data?.totalItems ?? null,
                    state: {
                      pageIndex: pagination.page - 1,
                      pageSize: pagination.limit,
                    },
                    onChange: (updater) => {
                      const next =
                        typeof updater === "function"
                          ? updater({
                              pageIndex: pagination.page - 1,
                              pageSize: pagination.limit,
                            })
                          : updater;
                      setPagination({
                        page: next.pageIndex + 1,
                        limit: next.pageSize,
                      });
                    },
                  }}
                  selectionStore={selectionStore}
                  columnVisibility={columnVisibility}
                  onColumnVisibilityChange={setColumnVisibility}
                  columnOrder={columnOrder}
                  onColumnOrderChange={setColumnOrder}
                  rowHeight={rowHeight}
                  onRowClick={(row) =>
                    router.push(`/project/${projectId}/evals/${row.id}`)
                  }
                  noResultsMessage="No evaluators found."
                />
              </div>
            </ResizableFilterLayout>
          </div>
        </DataTableControlsProvider>
      )}

      <EvaluatorsOverviewSelectionBar
        selectionStore={selectionStore}
        totalCount={evaluators.data?.totalItems ?? null}
        onDeleteSelection={({ selectAll, selectedIds }) => {
          if (selectAll) setDeleteAll(true);
          else setDeleteIds(selectedIds);
        }}
      />
      <EvaluatorBulkDeleteDialog
        open={deleteAll || deleteIds.length > 0}
        scope={deleteAll ? "allMatching" : "selected"}
        isDeleting={deleteMany.isPending}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteIds([]);
            setDeleteAll(false);
          }
        }}
        onConfirm={() =>
          deleteMany.mutate(
            deleteAll
              ? {
                  projectId,
                  isBatchAction: true,
                  search: searchQuery ?? undefined,
                  filter: filterState,
                }
              : { projectId, evaluatorIds: deleteIds },
          )
        }
      />
      <EvaluatorGalleryDialog
        projectId={projectId}
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        onSelectTemplate={(template) => {
          router.push(evaluatorCreateHref(projectId, template));
        }}
        onCreateFromScratch={(type) => {
          router.push(
            `/project/${projectId}/evals/new?type=${encodeURIComponent(type)}`,
          );
        }}
      />
      {selectedRuleEvaluator ? (
        <EvaluatorRuleRelationshipsSheet
          projectId={projectId}
          evaluatorId={selectedRuleEvaluator.id}
          evaluatorName={selectedRuleEvaluator.name}
          evaluatorType={selectedRuleEvaluator.type}
          evaluatorDefaultVariableMapping={
            selectedRuleEvaluator.versions[0]?.variableMapping
          }
          source="evaluator_overview"
          open
          onOpenChange={(open) => {
            if (!open) setAttachEvaluatorId(null);
          }}
        />
      ) : null}
      {projectDefaultModel.defaultModel &&
      projectDefaultModel.update.pendingModel ? (
        <DefaultModelChangeConfirmationDialog
          open
          currentModel={projectDefaultModel.defaultModel}
          nextModel={projectDefaultModel.update.pendingModel}
          loading={projectDefaultModel.update.isPending}
          onOpenChange={(open) => {
            if (!open) projectDefaultModel.update.dismissConfirmation();
          }}
          onConfirm={projectDefaultModel.update.confirmUpdate}
        />
      ) : null}
      {defaultModelConfig ? (
        <JudgeModelConfigurationDialog
          open={defaultModelConfigurationOpen}
          projectId={projectId}
          initialModel={defaultModelConfig}
          onOpenChange={setDefaultModelConfigurationOpen}
          onSave={projectDefaultModel.update.updateConfiguration}
        />
      ) : null}
    </Page>
  );
}
