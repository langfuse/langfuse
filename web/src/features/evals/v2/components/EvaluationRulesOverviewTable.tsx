import {
  ExternalLink,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { useRouter } from "next/router";
import { useCallback, useMemo, useState } from "react";
import { type RowSelectionState } from "@tanstack/react-table";
import { type FilterCondition } from "@langfuse/shared";

import { Switch } from "@/src/components/design-system/Switch/Switch";
import { DataTable } from "@/src/components/table/data-table";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Skeleton } from "@/src/components/ui/skeleton";
import { EvaluationRuleExecutionTraceStatusHistory } from "@/src/features/evals/v2/components/EvaluationRuleExecutionStatusHistory";
import { OverviewSelectionBar } from "@/src/features/evals/v2/components/OverviewSelectionBar";
import { RelationshipPills } from "@/src/features/evals/v2/components/RelationshipPills";
import { getEvaluationRuleTracesHref } from "@/src/features/evals/v2/lib/evaluationRuleTracesHref";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { api, type RouterOutputs } from "@/src/utils/api";
import { usdFormatter } from "@/src/utils/numbers";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

type EvaluationRuleRow = RouterOutputs["evalsV2"]["rules"][number];

function RelativeDate({ date }: { date: Date }) {
  return (
    <span
      className="text-muted-foreground whitespace-nowrap"
      title={date.toLocaleString()}
    >
      {formatDistanceToNowStrict(date, { addSuffix: true })}
    </span>
  );
}

function filterValueLabel(filter: FilterCondition) {
  if (filter.type === "null") return "";
  if (filter.type === "datetime")
    return new Date(filter.value).toLocaleString();
  if (Array.isArray(filter.value)) return filter.value.join(", ");
  return String(filter.value);
}

function filterLabel(filter: FilterCondition) {
  const key = "key" in filter && filter.key ? `.${filter.key}` : "";
  return `${filter.column}${key} ${filter.operator} ${filterValueLabel(filter)}`.trim();
}

function EvaluationRuleFilterSummary({ rule }: { rule: EvaluationRuleRow }) {
  if (rule.filter.length === 0) {
    return <span className="text-muted-foreground">All observations</span>;
  }

  const firstFilter = filterLabel(rule.filter[0]);
  const fullFilter = rule.filter.map(filterLabel).join(" and ");

  return (
    <div
      className="flex max-w-full min-w-0 items-center gap-1.5"
      title={fullFilter}
    >
      <span
        className="bg-input min-w-0 truncate rounded-md px-2 py-1 text-xs"
        title={firstFilter}
      >
        {firstFilter}
      </span>
      {rule.filter.length > 1 ? (
        <span className="bg-muted text-muted-foreground shrink-0 rounded-md px-1.5 py-1 text-xs">
          +{rule.filter.length - 1}
        </span>
      ) : null}
    </div>
  );
}

export function EvaluationRulesOverviewTable({
  projectId,
  hasWriteAccess,
}: {
  projectId: string;
  hasWriteAccess: boolean;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [, setSelectAll] = useState(false);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const peekConfig = useMemo(
    () => ({
      queryParams: ["editRule"],
      extractParamsValuesFromRow: (row: {
        openEdit?: boolean;
      }): Record<string, string> => (row.openEdit ? { editRule: "1" } : {}),
    }),
    [],
  );
  const peekNavigation = usePeekNavigation(peekConfig);
  const rules = api.evalsV2.rules.useQuery(
    { projectId },
    {
      enabled: Boolean(projectId),
      refetchInterval: 5_000,
    },
  );
  const ruleIds = useMemo(
    () => rules.data?.map((rule) => rule.id) ?? [],
    [rules.data],
  );
  const ruleCosts = api.evalsV2.ruleCosts.useQuery(
    { projectId, ruleIds },
    {
      enabled: Boolean(projectId) && rules.isSuccess,
      staleTime: 60_000,
    },
  );
  const statusMutation = api.evalsV2.setRulesEnabled.useMutation({
    onError: (error) => trpcErrorToast(error),
    onSuccess: async ({ ids }, variables) => {
      setRowSelection({});
      showSuccessToast({
        title: variables.enabled
          ? ids.length === 1
            ? "Rule enabled"
            : "Rules enabled"
          : ids.length === 1
            ? "Rule disabled"
            : "Rules disabled",
        description: `${ids.length} evaluation rule${ids.length === 1 ? "" : "s"} updated.`,
      });
      await utils.evalsV2.rules.invalidate({ projectId });
    },
  });
  const deleteMutation = api.evalsV2.deleteRules.useMutation({
    onError: (error) => trpcErrorToast(error),
    onSuccess: async ({ ids }) => {
      setDeleteIds([]);
      setRowSelection({});
      showSuccessToast({
        title: ids.length === 1 ? "Rule deleted" : "Rules deleted",
        description: `${ids.length} evaluation rule${ids.length === 1 ? "" : "s"} deleted.`,
      });
      await Promise.all([
        utils.evalsV2.rules.invalidate({ projectId }),
        utils.evalsV2.evaluators.invalidate({ projectId }),
        utils.evals.invalidate(),
      ]);
    },
  });

  const selectedIds = Object.keys(rowSelection).filter(
    (id) => rowSelection[id],
  );
  const { selectActionColumn } = TableSelectionManager<EvaluationRuleRow>({
    projectId,
    tableName: "evaluator-evaluation-rules-v2",
    setSelectedRows: setRowSelection,
    setSelectAll,
  });

  const setEnabled = useCallback(
    (ruleIds: string[], enabled: boolean) =>
      statusMutation.mutate({ projectId, ruleIds, enabled }),
    [projectId, statusMutation],
  );

  const columns = useMemo<LangfuseColumnDef<EvaluationRuleRow>[]>(
    () => [
      {
        ...selectActionColumn,
        size: 35,
        minSize: 35,
        maxSize: 35,
        enableResizing: false,
      },
      {
        accessorKey: "name",
        id: "name",
        header: "Name",
        size: 180,
        cell: ({ row }) => (
          <span className="block truncate font-bold" title={row.original.name}>
            {row.original.name}
          </span>
        ),
      },
      {
        accessorKey: "enabled",
        id: "enabled",
        header: "Enabled",
        size: 90,
        cell: ({ row }) => (
          <div onClick={(event) => event.stopPropagation()}>
            <Switch
              checked={row.original.enabled}
              disabled={!hasWriteAccess || statusMutation.isPending}
              onCheckedChange={(enabled) =>
                setEnabled([row.original.id], enabled)
              }
              aria-label={`${row.original.enabled ? "Disable" : "Enable"} ${row.original.name}`}
              color="green"
            />
          </div>
        ),
      },
      {
        accessorKey: "totalCost",
        id: "totalCost",
        header: "Total cost (7d)",
        size: 120,
        cell: ({ row }) => {
          if (ruleCosts.isPending) {
            return <Skeleton className="h-4 w-16" />;
          }

          const totalCost = ruleCosts.data?.[row.original.id];
          return totalCost == null ? "–" : usdFormatter(totalCost, 2, 4);
        },
      },
      {
        accessorKey: "jobExecutions",
        id: "jobExecutions",
        header: "Last 5 runs",
        size: 120,
        cell: ({ row }) => (
          <EvaluationRuleExecutionTraceStatusHistory
            traces={row.original.executionTraces}
          />
        ),
      },
      {
        accessorKey: "evaluators",
        id: "evaluators",
        header: "Evaluators",
        size: 220,
        cell: ({ row }) => (
          <RelationshipPills
            items={row.original.evaluators.map((evaluator) => ({
              id: evaluator.id,
              name: evaluator.scoreName,
            }))}
            totalCount={row.original.evaluatorCount}
            emptyLabel="No evaluators"
          />
        ),
      },
      {
        accessorKey: "filter",
        id: "filter",
        header: "Filters",
        size: 300,
        isFlexWidth: true,
        cell: ({ row }) => <EvaluationRuleFilterSummary rule={row.original} />,
      },
      {
        accessorKey: "sampling",
        id: "sampling",
        header: "Sampling",
        size: 100,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {Math.round(row.original.sampling * 100)}%
          </span>
        ),
      },
      {
        accessorKey: "createdByUser",
        id: "createdByUser",
        header: "Created by",
        size: 180,
        enableSorting: false,
        cell: ({ row }) => {
          const creator =
            row.original.createdByUser?.name ??
            row.original.createdByUser?.email ??
            "Unknown";
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
        size: 150,
        cell: ({ row }) => <RelativeDate date={row.original.createdAt} />,
      },
      {
        accessorKey: "updatedAt",
        id: "updatedAt",
        header: "Updated at",
        size: 150,
        cell: ({ row }) => <RelativeDate date={row.original.updatedAt} />,
      },
      {
        accessorKey: "actions",
        id: "actions",
        header: "",
        size: 170,
        minSize: 170,
        maxSize: 170,
        enableSorting: false,
        enableResizing: false,
        cell: ({ row }) => (
          <div
            className="flex items-center justify-end gap-1"
            onClick={(event) => event.stopPropagation()}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                router.push(
                  getEvaluationRuleTracesHref({
                    projectId,
                    ruleId: row.original.id,
                  }),
                )
              }
            >
              View traces
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
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
                <DropdownMenuItem
                  disabled={!hasWriteAccess}
                  onSelect={() =>
                    peekNavigation.openPeek(row.original.id, {
                      ...row.original,
                      openEdit: true,
                    })
                  }
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!hasWriteAccess}
                  onSelect={() => setDeleteIds([row.original.id])}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [
      hasWriteAccess,
      peekNavigation,
      projectId,
      router,
      ruleCosts.data,
      ruleCosts.isPending,
      selectActionColumn,
      setEnabled,
      statusMutation.isPending,
    ],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DataTable
        tableName="evaluator-evaluation-rules-v2"
        columns={columns}
        data={
          rules.isLoading
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
                  data: rules.data ?? [],
                }
        }
        rowSelection={rowSelection}
        setRowSelection={setRowSelection}
        hidePagination
        cellPadding="comfortable"
        noResultsMessage="No evaluation rules found."
        onRowClick={(row) => peekNavigation.openPeek(row.id, row)}
      />
      <OverviewSelectionBar
        selectedCount={selectedIds.length}
        onClear={() => setRowSelection({})}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasWriteAccess || statusMutation.isPending}
          onClick={() => setEnabled(selectedIds, true)}
        >
          <Play className="mr-2 h-4 w-4" />
          Enable
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasWriteAccess || statusMutation.isPending}
          onClick={() => setEnabled(selectedIds, false)}
        >
          <Pause className="mr-2 h-4 w-4" />
          Disable
        </Button>
        <Button
          type="button"
          variant="destructive-secondary"
          size="sm"
          disabled={!hasWriteAccess}
          onClick={() => setDeleteIds(selectedIds)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </OverviewSelectionBar>
      <ConfirmDialog
        open={deleteIds.length > 0}
        onOpenChange={(open) => {
          if (!open) setDeleteIds([]);
        }}
        title={deleteIds.length === 1 ? "Delete rule?" : "Delete rules?"}
        description={`This permanently deletes ${deleteIds.length} evaluation rule${deleteIds.length === 1 ? "" : "s"} and detaches evaluators from ${deleteIds.length === 1 ? "it" : "them"}. Evaluators left without another rule become inactive.`}
        confirmLabel={deleteIds.length === 1 ? "Delete rule" : "Delete rules"}
        loading={deleteMutation.isPending}
        onConfirm={async () => {
          await deleteMutation.mutateAsync({
            projectId,
            ruleIds: deleteIds,
          });
        }}
      />
    </div>
  );
}
