import { formatDistanceToNowStrict } from "date-fns";
import { ListTree, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";
import { type RowSelectionState } from "@tanstack/react-table";
import { type FilterState } from "@langfuse/shared";

import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { OverviewSelectionBar } from "@/src/features/evals/v2/components/OverviewSelectionBar";
import { RelationshipPills } from "@/src/features/evals/v2/components/RelationshipPills";
import { getEvaluationRuleTracesHref } from "@/src/features/evals/v2/lib/evaluationRuleTracesHref";
import { encodeFiltersGeneric } from "@/src/features/filters/lib/filter-query-encoding";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { api, type RouterOutputs } from "@/src/utils/api";
import { usdFormatter } from "@/src/utils/numbers";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

type EvaluatorRow = RouterOutputs["evalsV2"]["evaluators"][number];

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

export function getEvaluatorScoresHref({
  projectId,
  scoreName,
}: {
  projectId: string;
  scoreName: string;
}) {
  const filter: FilterState = [
    {
      column: "name",
      type: "stringOptions",
      operator: "any of",
      value: [scoreName],
    },
    {
      column: "source",
      type: "stringOptions",
      operator: "any of",
      value: ["EVAL"],
    },
  ];

  return {
    pathname: `/project/${projectId}/scores`,
    query: { filter: encodeFiltersGeneric(filter) },
  };
}

export function EvaluatorOverviewTable({
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
  const evaluators = api.evalsV2.evaluators.useQuery(
    { projectId },
    { enabled: Boolean(projectId) },
  );
  const evaluatorIds = useMemo(
    () => evaluators.data?.map((evaluator) => evaluator.id) ?? [],
    [evaluators.data],
  );
  const evaluatorCosts = api.evals.costByEvaluatorIds.useQuery(
    { projectId, evaluatorIds },
    {
      enabled: Boolean(projectId) && evaluators.isSuccess,
      staleTime: 60_000,
    },
  );
  const deleteMutation = api.evalsV2.deleteEvaluators.useMutation({
    onError: (error) => trpcErrorToast(error),
    onSuccess: async ({ ids }) => {
      setDeleteIds([]);
      setRowSelection({});
      showSuccessToast({
        title: ids.length === 1 ? "Evaluator deleted" : "Evaluators deleted",
        description: `${ids.length} evaluator${ids.length === 1 ? "" : "s"} deleted.`,
      });
      await Promise.all([
        utils.evalsV2.evaluators.invalidate({ projectId }),
        utils.evalsV2.rules.invalidate({ projectId }),
        utils.evals.invalidate(),
      ]);
    },
  });

  const selectedIds = Object.keys(rowSelection).filter(
    (id) => rowSelection[id],
  );
  const { selectActionColumn } = TableSelectionManager<EvaluatorRow>({
    projectId,
    tableName: "evaluators-v2",
    setSelectedRows: setRowSelection,
    setSelectAll,
  });

  const columns = useMemo<LangfuseColumnDef<EvaluatorRow>[]>(
    () => [
      {
        ...selectActionColumn,
        size: 35,
        minSize: 35,
        maxSize: 35,
        enableResizing: false,
      },
      {
        accessorKey: "scoreName",
        id: "scoreName",
        header: "Name",
        size: 200,
        cell: ({ row }) => (
          <span
            className="block min-w-0 truncate font-bold"
            title={row.original.scoreName}
          >
            {row.original.scoreName}
          </span>
        ),
      },
      {
        accessorKey: "type",
        id: "type",
        header: "Type",
        size: 150,
        cell: ({ row }) => (
          <Badge variant="secondary" className="whitespace-nowrap">
            {row.original.evalTemplate?.type === "CODE"
              ? "Code"
              : "LLM as a judge"}
          </Badge>
        ),
      },
      {
        accessorKey: "totalCost",
        id: "totalCost",
        header: "Total cost (7d)",
        size: 120,
        cell: ({ row }) => {
          if (evaluatorCosts.isPending) {
            return <Skeleton className="h-4 w-16" />;
          }

          const totalCost = evaluatorCosts.data?.[row.original.id];
          return totalCost == null ? "–" : usdFormatter(totalCost, 2, 4);
        },
      },
      {
        accessorKey: "creator",
        id: "creator",
        header: "Created by",
        size: 180,
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
        accessorKey: "rules",
        id: "rules",
        header: "Used by",
        size: 220,
        isFlexWidth: true,
        cell: ({ row }) => (
          <RelationshipPills
            items={row.original.rules}
            totalCount={row.original.ruleCount}
            emptyLabel="No rules"
          />
        ),
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
            className="flex justify-end gap-1"
            onClick={(event) => event.stopPropagation()}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                router.push(
                  getEvaluatorScoresHref({
                    projectId,
                    scoreName: row.original.scoreName,
                  }),
                )
              }
            >
              View scores
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="View traces"
                  onClick={() =>
                    router.push(
                      getEvaluationRuleTracesHref({
                        projectId,
                        evaluatorId: row.original.id,
                      }),
                    )
                  }
                >
                  <ListTree className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View traces</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Actions for ${row.original.scoreName}`}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={!hasWriteAccess}
                  onSelect={() =>
                    router.push(
                      `/project/${projectId}/evals/v2/${encodeURIComponent(row.original.id)}?edit=1`,
                    )
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
      evaluatorCosts.data,
      evaluatorCosts.isPending,
      hasWriteAccess,
      projectId,
      router,
      selectActionColumn,
    ],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DataTable
        tableName="evaluators-v2"
        columns={columns}
        data={
          evaluators.isLoading
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
                  data: evaluators.data ?? [],
                }
        }
        rowSelection={rowSelection}
        setRowSelection={setRowSelection}
        hidePagination
        cellPadding="comfortable"
        noResultsMessage="No evaluators found."
        onRowClick={(row) =>
          router.push(
            `/project/${projectId}/evals/v2/${encodeURIComponent(row.id)}`,
          )
        }
      />
      <OverviewSelectionBar
        selectedCount={selectedIds.length}
        onClear={() => setRowSelection({})}
      >
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
        title={
          deleteIds.length === 1 ? "Delete evaluator?" : "Delete evaluators?"
        }
        description={`This permanently deletes ${deleteIds.length} evaluator${deleteIds.length === 1 ? "" : "s"} and detaches ${deleteIds.length === 1 ? "it" : "them"} from every evaluation rule. This action cannot be undone.`}
        confirmLabel={
          deleteIds.length === 1 ? "Delete evaluator" : "Delete evaluators"
        }
        loading={deleteMutation.isPending}
        onConfirm={async () => {
          await deleteMutation.mutateAsync({
            projectId,
            evaluatorIds: deleteIds,
          });
        }}
      />
    </div>
  );
}
