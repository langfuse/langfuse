import { useMemo, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { Copy, ExternalLink, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/router";
import { StringParam, useQueryParam, withDefault } from "use-query-params";
import { DataTable } from "@/src/components/table/data-table";
import {
  DataTableControls,
  DataTableControlsProvider,
} from "@/src/components/table/data-table-controls";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import { TablePeekViewEvaluatorConfigDetail } from "@/src/components/table/peek/peek-evaluator-config-detail";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { createTableSelectionStore } from "@/src/components/table/table-selection-store";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { SingleLineOverflowList } from "@/src/components/SingleLineOverflowList";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { CreateRuleDialog } from "@/src/features/evals/v2/components/Rules/CreateRuleDialog/CreateRuleDialog";
import { EditRuleDialog } from "@/src/features/evals/v2/components/Rules/EditRuleDialog/EditRuleDialog";
import { RulesOverviewSelectionBar } from "@/src/features/evals/v2/components/Rules/RulesTable/components/RulesOverviewSelectionBar/RulesOverviewSelectionBar";
import { RuleActiveSwitchCell } from "@/src/features/evals/v2/components/Rules/RulesTable/components/RuleActiveSwitchCell/RuleActiveSwitchCell";
import { RuleNameCell } from "@/src/features/evals/v2/components/Rules/RulesTable/components/RuleNameCell/RuleNameCell";
import { RulesTableToolbar } from "@/src/features/evals/v2/components/Rules/RulesTable/components/RulesTableToolbar/RulesTableToolbar";
import { usePaginationState } from "@/src/hooks/usePaginationState";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { RuleFilterPills } from "@/src/features/evals/v2/components/Rules/RuleFilterPills/RuleFilterPills";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { EvaluatorExecutionHistory } from "@/src/features/evals/v2/components/Rules/EvaluatorExecutionHistory/EvaluatorExecutionHistory";
import type { RuleTableRow } from "@/src/features/evals/v2/types/rules";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { api, type RouterInputs } from "@/src/utils/api";
import { usdFormatter } from "@/src/utils/numbers";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import {
  isLegacyEvalTarget,
  requiresLegacyMigrationAction,
} from "@/src/features/evals/utils/typeHelpers";
import {
  getRuleNavigationAction,
  getRuleNavigationUrl,
} from "@/src/features/evals/v2/utils/ruleNavigation";
import { ruleExecutionsUrl } from "@/src/features/evals/v2/fns/rules/ruleExecutionsUrl";
import { TableViewPresetTableName } from "@langfuse/shared";
import { useSidebarFilterState } from "@/src/features/filters/hooks/useSidebarFilterState";
import { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import {
  evaluationRuleTableFilterColumns,
  evaluationRuleTableFilterConfig,
  evaluationRuleTableFilterOptions,
} from "@/src/features/evals/v2/constants/tableFilterColumns";
import { omitFilterFacets } from "@/src/features/filters/lib/filter-config";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { createUserTableColumn } from "@/src/components/design-system/table/columns/createUserTableColumn";

function RelativeDate({ date }: { date: Date }) {
  return (
    <span className="text-muted-foreground" title={date.toLocaleString()}>
      {formatDistanceToNowStrict(date, { addSuffix: true })}
    </span>
  );
}

function RuleEvaluatorsCell({
  assignments,
}: Pick<RuleTableRow, "assignments">) {
  if (assignments.length === 0) {
    return <span className="text-muted-foreground">No evaluators</span>;
  }

  return (
    <SingleLineOverflowList
      items={assignments}
      additionalOverflowCount={0}
      getKey={(assignment) => assignment.id}
      renderItem={(assignment) => (
        <Badge variant="secondary" size="sm">
          {assignment.evaluator.name}
        </Badge>
      )}
      renderOverflow={({ hiddenItems, overflowItemCount }) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" size="sm" className="font-normal">
              +{overflowItemCount}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            {hiddenItems.map(({ evaluator }) => evaluator.name).join(", ")}
          </TooltipContent>
        </Tooltip>
      )}
    />
  );
}

export function RulesTable({
  projectId,
  hasWriteAccess,
}: {
  projectId: string;
  hasWriteAccess: boolean;
}) {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const [selectionStore] = useState(createTableSelectionStore);
  const [pagination, setPagination] = usePaginationState(1, 50);
  const [orderBy, setOrderBy] = useOrderByState({
    column: "createdAt",
    order: "DESC",
  });
  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "evaluationRulesV2",
    "s",
  );
  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );
  const filterOptionsQuery = api.evalsV2.rules.filterOptions.useQuery(
    { projectId },
    {
      enabled: Boolean(projectId),
      refetchOnWindowFocus: false,
      staleTime: Infinity,
    },
  );
  const filterOptions = useMemo(
    () => ({
      ...evaluationRuleTableFilterOptions,
      name: filterOptionsQuery.data?.name ?? [],
      creator: filterOptionsQuery.data?.creator ?? [],
    }),
    [filterOptionsQuery.data],
  );
  const filterConfig = useMemo(
    () =>
      omitFilterFacets(
        evaluationRuleTableFilterConfig,
        filterOptionsQuery.data?.hasUpgradeRequired === false
          ? ["upgradeRequired"]
          : [],
      ),
    [filterOptionsQuery.data?.hasUpgradeRequired],
  );
  const queryFilter = useSidebarFilterState(filterConfig, filterOptions, {
    loading: filterOptionsQuery.isPending,
    stateLocation: "urlAndSessionStorage",
    sessionFilterContextId: projectId,
    onExplicitFilterStateChange: () => {
      setPagination({ page: 1, limit: pagination.limit });
      selectionStore.getState().actions.clearSelection();
    },
  });
  const filterState = queryFilter.filterState;
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [cloneRule, setCloneRule] = useState<RuleTableRow | null>(null);
  // Query param so other surfaces can deep-link straight to a rule.
  const [editRuleId, setEditRuleId] = useQueryParam(
    "rule",
    withDefault(StringParam, null),
  );
  const legacyPeekNavigation = usePeekNavigation({
    tableName: "evaluation-rules-v2",
    isV4: true,
  });
  const legacyPeekConfig = useMemo(
    () => ({
      itemType: "RUNNING_EVALUATOR" as const,
      detailNavigationKey: "evals",
      ...legacyPeekNavigation,
    }),
    [legacyPeekNavigation],
  );
  const rules = api.evalsV2.rules.list.useQuery({
    projectId,
    ...pagination,
    orderBy: orderBy
      ? (orderBy as RouterInputs["evalsV2"]["rules"]["list"]["orderBy"])
      : undefined,
    search: searchQuery ?? undefined,
    filter: filterState,
  });
  const ruleIds = useMemo(
    () => rules.data?.rules.map(({ id }) => id) ?? [],
    [rules.data?.rules],
  );
  const costs = api.evalsV2.rules.costByRuleIds.useQuery(
    { projectId, ruleIds },
    { enabled: ruleIds.length > 0, meta: { silentHttpCodes: [503] } },
  );
  const recentExecutions = api.evalsV2.rules.recentExecutions.useQuery(
    { projectId, ruleIds },
    { enabled: ruleIds.length > 0, meta: { silentHttpCodes: [503] } },
  );
  const deleteMany = api.evalsV2.rules.deleteMany.useMutation({
    onError: trpcErrorToast,
    onSuccess: async (result) => {
      capture("evaluation_rules:delete", {
        ruleCount: result.ruleIds.length,
      });
      setDeleteIds([]);
      selectionStore.getState().actions.clearSelection();
      await Promise.all([
        utils.evalsV2.rules.list.invalidate({ projectId }),
        utils.evalsV2.rules.filterOptions.invalidate({ projectId }),
      ]);
    },
  });
  const selectionActions = selectionStore.getState().actions;
  const { selectActionColumn } = TableSelectionManager<RuleTableRow>({
    projectId,
    tableName: "evaluation-rules-v2",
    setSelectedRows: selectionActions.setRowSelection,
    setSelectAll: selectionActions.setSelectAll,
    selectionStore,
  });
  const columns = useMemo<LangfuseColumnDef<RuleTableRow>[]>(
    () => [
      selectActionColumn,
      {
        accessorKey: "name",
        id: "name",
        header: "Name",
        size: 260,
        isFixedPosition: true,
        enableSorting: true,
        cell: ({ row }) => {
          const legacy = isLegacyEvalTarget(row.original.targetObject);
          const upgradeRequired = requiresLegacyMigrationAction({
            targetObject: row.original.targetObject,
            status: row.original.enabled ? "ACTIVE" : "INACTIVE",
            timeScope: row.original.timeScope,
          });
          return (
            <RuleNameCell
              name={row.original.name}
              legacy={legacy}
              onUpgrade={
                upgradeRequired
                  ? () => {
                      capture("v4_migration:update_required_badge_clicked", {
                        scope: "single",
                      });
                      router.push(
                        getRuleNavigationUrl({
                          projectId,
                          ruleId: row.original.id,
                          targetObject: row.original.targetObject,
                          enabled: row.original.enabled,
                        }),
                      );
                    }
                  : undefined
              }
            />
          );
        },
      },
      {
        accessorKey: "enabled",
        id: "enabled",
        header: "Enabled",
        size: 90,
        enableHiding: true,
        enableSorting: true,
        cell: ({ row }) => (
          <RuleActiveSwitchCell
            rule={row.original}
            projectId={projectId}
            hasWriteAccess={hasWriteAccess}
          />
        ),
      },
      createNumberTableColumn<RuleTableRow>({
        accessorFn: (row) => costs.data?.[row.id],
        id: "totalCost",
        header: "Total cost (7d)",
        size: 140,
        enableHiding: true,
        emptyValue: "—",
        formatter: (value) => usdFormatter(value, 2, 4),
        getValue: (value) => {
          if (costs.isPending) return { type: "loading" };
          if (value === null || value === undefined) return undefined;

          return value;
        },
      }),
      {
        accessorKey: "executionTraces",
        id: "executionTraces",
        header: "Last 5 runs",
        size: 140,
        enableHiding: true,
        cell: ({ row }) => {
          if (recentExecutions.isPending) {
            return <Skeleton className="h-4 w-16" />;
          }
          return (
            <button
              type="button"
              className="focus-visible:ring-ring rounded-sm focus-visible:ring-2 focus-visible:outline-none"
              aria-label={`View runs for ${row.original.name}`}
              onClick={(event) => {
                event.stopPropagation();
                router.push(ruleExecutionsUrl(projectId, row.original.id));
              }}
            >
              <EvaluatorExecutionHistory
                traces={recentExecutions.data?.[row.original.id] ?? []}
              />
            </button>
          );
        },
      },
      {
        accessorKey: "assignments",
        id: "assignments",
        header: "Evaluators",
        size: 240,
        enableHiding: true,
        cell: ({ row }) => (
          <RuleEvaluatorsCell assignments={row.original.assignments} />
        ),
      },
      {
        accessorKey: "filter",
        id: "filter",
        header: "Filters",
        size: 300,
        enableHiding: true,
        cell: ({ row }) =>
          isLegacyEvalTarget(row.original.targetObject) ? (
            <span className="text-muted-foreground">Not available</span>
          ) : (
            <RuleFilterPills filter={row.original.filter} />
          ),
      },
      createNumberTableColumn<RuleTableRow>({
        accessorKey: "sampling",
        header: "Sampling",
        size: 100,
        enableHiding: true,
        enableSorting: true,
        formatter: (value) => `${Math.round(value * 100)}%`,
      }),
      createUserTableColumn<RuleTableRow>({
        accessorKey: "createdByUser",
        header: "Created by",
        size: 180,
        enableHiding: true,
        variant: "text",
        emptyValue: "API",
      }),
      {
        accessorKey: "createdAt",
        id: "createdAt",
        header: "Created at",
        size: 180,
        enableHiding: true,
        defaultHidden: true,
        enableSorting: true,
        cell: ({ row }) => <RelativeDate date={row.original.createdAt} />,
      },
      {
        accessorKey: "updatedAt",
        id: "updatedAt",
        header: "Updated at",
        size: 180,
        enableHiding: true,
        enableSorting: true,
        cell: ({ row }) => <RelativeDate date={row.original.updatedAt} />,
      },
      {
        accessorKey: "id",
        id: "actions",
        header: "Actions",
        size: 180,
        isFixedPosition: true,
        enableSorting: false,
        enableResizing: false,
        cell: ({ row }) => {
          const navigationAction = getRuleNavigationAction(row.original);
          return (
            <div
              className="flex w-full min-w-0 items-center justify-start gap-1"
              onClick={(event) => event.stopPropagation()}
            >
              <Button
                type="button"
                variant="link"
                size="sm"
                className="text-foreground hover:text-foreground h-auto px-0 py-0"
                onClick={(event) => {
                  event.stopPropagation();
                  router.push(ruleExecutionsUrl(projectId, row.original.id));
                }}
              >
                View traces <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Actions for ${row.original.name}`}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {navigationAction === "edit" ? (
                    <DropdownMenuItem
                      onClick={() => setEditRuleId(row.original.id)}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    disabled={!hasWriteAccess || navigationAction !== "edit"}
                    onClick={() => setCloneRule(row.original)}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Clone
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!hasWriteAccess}
                    onClick={() => setDeleteIds([row.original.id])}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [
      hasWriteAccess,
      costs.data,
      costs.isPending,
      projectId,
      recentExecutions.data,
      recentExecutions.isPending,
      router,
      capture,
      selectActionColumn,
      setEditRuleId,
    ],
  );
  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<RuleTableRow>(
      "evaluationRulesV2ColumnVisibility",
      columns,
    );
  const [columnOrder, setColumnOrder] = useColumnOrder<RuleTableRow>(
    "evaluationRulesV2ColumnOrder-v2",
    columns,
  );
  const { isLoading: isViewLoading, ...viewControllers } = useTableViewManager({
    tableName: TableViewPresetTableName.EvaluationRules,
    projectId,
    stateUpdaters: {
      setFilters: (filters) =>
        queryFilter.setFilterState(filters, { origin: "saved_view" }),
      setExpandedFilters: queryFilter.onExpandedChange,
      setSearchQuery: (query) => {
        setSearchQuery(query);
        setPagination({ page: 1, limit: pagination.limit });
        selectionActions.clearSelection();
      },
      setColumnOrder,
      setColumnVisibility,
      setOrderBy: (nextOrderBy) => {
        setOrderBy(nextOrderBy);
        setPagination({ page: 1, limit: pagination.limit });
        selectionActions.clearSelection();
      },
    },
    validationContext: {
      columns,
      filterColumnDefinition: evaluationRuleTableFilterColumns,
      expandableFilterColumns: evaluationRuleTableFilterConfig.facets.map(
        (facet) => facet.column,
      ),
    },
    currentFilterState: queryFilter.explicitFilterState,
    currentExpandedFilters: queryFilter.expanded,
  });

  return (
    <DataTableControlsProvider
      tableName={evaluationRuleTableFilterConfig.tableName}
    >
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <RulesTableToolbar
          columns={columns}
          currentQuery={searchQuery ?? undefined}
          onSearchChange={(query) => {
            setSearchQuery(query || null);
            setPagination({ page: 1, limit: pagination.limit });
            selectionActions.clearSelection();
          }}
          pageRowIds={rules.data?.rules.map(({ id }) => id) ?? []}
          pageSize={pagination.limit}
          pageIndex={pagination.page - 1}
          totalCount={rules.data?.totalItems ?? null}
          selectionStore={selectionStore}
          columnVisibility={columnVisibility}
          setColumnVisibility={setColumnVisibility}
          columnOrder={columnOrder}
          setColumnOrder={setColumnOrder}
          rowHeight={rowHeight}
          setRowHeight={setRowHeight}
          filterState={filterState}
          orderByState={orderBy}
          viewConfig={{
            tableName: TableViewPresetTableName.EvaluationRules,
            projectId,
            controllers: viewControllers,
          }}
        />
        <ResizableFilterLayout>
          <DataTableControls
            key={viewControllers.selectedViewId ?? "no-view"}
            queryFilter={queryFilter}
          />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <DataTable
              tableName="evaluation-rules-v2"
              columns={columns}
              data={
                rules.isPending || isViewLoading
                  ? { isLoading: true, isError: false }
                  : rules.isError
                    ? {
                        isLoading: false,
                        isError: true,
                        error: rules.error.message,
                      }
                    : {
                        isLoading: false,
                        isError: false,
                        data: rules.data.rules,
                      }
              }
              selectionStore={selectionStore}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
              columnOrder={columnOrder}
              onColumnOrderChange={setColumnOrder}
              rowHeight={rowHeight}
              orderBy={orderBy}
              setOrderBy={(nextOrderBy) => {
                setOrderBy(nextOrderBy);
                setPagination({ page: 1, limit: pagination.limit });
                selectionActions.clearSelection();
              }}
              pagination={{
                totalCount: rules.data?.totalItems ?? null,
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
              noResultsMessage="No evaluation rules found."
              onRowClick={(rule) => {
                const navigationAction = getRuleNavigationAction(rule);
                if (navigationAction === "remap") {
                  router.push(
                    getRuleNavigationUrl({
                      projectId,
                      ruleId: rule.id,
                      targetObject: rule.targetObject,
                      enabled: rule.enabled,
                    }),
                  );
                  return;
                }

                if (navigationAction === "peek") {
                  setEditRuleId(null);
                  legacyPeekNavigation.openPeek(rule.id, rule);
                  return;
                }

                setEditRuleId(rule.id);
              }}
            />
          </div>
        </ResizableFilterLayout>
        <TablePeekViewEvaluatorConfigDetail
          {...legacyPeekConfig}
          projectId={projectId}
          readOnly
        />
        <RulesOverviewSelectionBar
          projectId={projectId}
          hasWriteAccess={hasWriteAccess}
          searchQuery={searchQuery ?? undefined}
          totalCount={rules.data?.totalItems ?? null}
          selectionStore={selectionStore}
          filterState={filterState}
        />
        <ConfirmDialog
          open={deleteIds.length > 0}
          onOpenChange={(open) => {
            if (!open) setDeleteIds([]);
          }}
          title="Delete evaluation rules?"
          description={`This permanently deletes ${deleteIds.length} rule${deleteIds.length === 1 ? "" : "s"} and its evaluator assignments.`}
          confirmLabel="Delete"
          loading={deleteMany.isPending}
          onConfirm={() => deleteMany.mutate({ projectId, ruleIds: deleteIds })}
        />
        {editRuleId ? (
          <EditRuleDialog
            projectId={projectId}
            ruleId={editRuleId}
            hasWriteAccess={hasWriteAccess}
            onOpenChange={(open) => !open && setEditRuleId(null)}
          />
        ) : null}
        {cloneRule ? (
          <CreateRuleDialog
            projectId={projectId}
            open
            initialRule={cloneRule}
            onOpenChange={(open) => !open && setCloneRule(null)}
            successNotification="toast"
          />
        ) : null}
      </div>
    </DataTableControlsProvider>
  );
}
