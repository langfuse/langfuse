import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { ChevronRight, Link2, Pencil } from "lucide-react";

import { TablePeekView } from "@/src/components/table/peek";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import { Label } from "@/src/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { DeleteRunScopeButton } from "@/src/features/evals/v2/components/DeleteRunScopeButton";
import { ScopePreviewTable } from "@/src/features/evals/v2/components/ScopePreviewTable";
import { RunScopeEditView } from "@/src/features/evals/v2/components/RunScopeEditView";
import { RunScopeEvaluatorConnections } from "@/src/features/evals/v2/components/RunScopeEvaluatorConnections";
import { InlineFilterState } from "@/src/features/filters/components/filter-builder";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { api } from "@/src/utils/api";
import { toAbsoluteTimeRange } from "@/src/utils/date-range-utils";

export function TablePeekViewRunScopeDetail({
  projectId,
  ...peekProps
}: Omit<React.ComponentProps<typeof TablePeekView>, "children" | "title"> & {
  projectId: string;
}) {
  const router = useRouter();
  const runScopeId = router.query.peek as string | undefined;
  const [evaluatorPickerOpen, setEvaluatorPickerOpen] = useState(false);
  const [editingScopeId, setEditingScopeId] = useState<string | null>(null);
  const editRequested = router.query.editScope === "1";
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:CUD",
  });
  const runScope = api.evalsV2.runScopeById.useQuery(
    { projectId, runScopeId: runScopeId ?? "" },
    { enabled: Boolean(projectId && runScopeId) },
  );
  const evaluatorOptions = api.evalsV2.evaluatorOptions.useQuery(
    { projectId },
    {
      enabled: Boolean(projectId) && evaluatorPickerOpen && hasWriteAccess,
    },
  );
  const { timeRange } = useTableDateRange(projectId);
  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange),
    [timeRange],
  );

  useEffect(() => {
    if (editRequested && runScopeId) setEditingScopeId(runScopeId);
  }, [editRequested, runScopeId]);

  const closeScopeEdit = () => {
    setEditingScopeId(null);
    if (!editRequested) return;
    const { editScope: _editScope, ...query } = router.query;
    router
      .replace({ pathname: router.pathname, query }, undefined, {
        shallow: true,
      })
      .catch(() => undefined);
  };

  const attachedEvaluatorIds = new Set(
    runScope.data?.evaluators.map((evaluator) => evaluator.id) ?? [],
  );
  const availableEvaluators = (evaluatorOptions.data ?? []).filter(
    (evaluator) =>
      evaluator.targetObject === runScope.data?.targetObject &&
      !attachedEvaluatorIds.has(evaluator.id),
  );

  const openEvaluatorEdit = (evaluatorId: string) => {
    if (!runScopeId) return;
    router
      .push({
        pathname: `/project/${projectId}/evals/v2/${encodeURIComponent(evaluatorId)}`,
        query: { edit: "1", runScopeId },
      })
      .catch(() => undefined);
  };

  const scopeActions =
    hasWriteAccess && runScope.data ? (
      <>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Edit run scope"
              disabled={editingScopeId === runScopeId}
              onClick={() => setEditingScopeId(runScope.data.id)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit run scope</TooltipContent>
        </Tooltip>
        <DeleteRunScopeButton
          projectId={projectId}
          runScope={{
            id: runScope.data.id,
            name: runScope.data.name,
            evaluatorCount: runScope.data.evaluators.length,
          }}
          variant="ghost"
          iconOnly
          onDeleted={peekProps.closePeek}
        />
      </>
    ) : undefined;

  const scopeActionsMenu =
    hasWriteAccess && runScope.data ? (
      <div className="flex w-full flex-col gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start font-normal"
          disabled={editingScopeId === runScopeId}
          onClick={() => setEditingScopeId(runScope.data.id)}
        >
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Edit run scope
        </Button>
        <DeleteRunScopeButton
          projectId={projectId}
          runScope={{
            id: runScope.data.id,
            name: runScope.data.name,
            evaluatorCount: runScope.data.evaluators.length,
          }}
          variant="ghost"
          size="sm"
          className="w-full justify-start font-normal"
          onDeleted={peekProps.closePeek}
        />
      </div>
    ) : undefined;

  return (
    <TablePeekView
      {...peekProps}
      title={runScope.data?.name ?? "Run scope"}
      actions={scopeActions}
      actionsMenu={scopeActionsMenu}
    >
      {runScope.isError ? (
        <p className="text-muted-foreground p-4 text-sm">
          This run scope could not be loaded.
        </p>
      ) : runScope.isPending || !runScope.data ? (
        <div className="flex flex-col gap-4 p-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-52 w-full" />
        </div>
      ) : editingScopeId === runScopeId ? (
        <RunScopeEditView
          key={runScope.data.id}
          projectId={projectId}
          runScope={runScope.data}
          timeRange={absoluteTimeRange}
          onCancel={closeScopeEdit}
          onSaved={closeScopeEdit}
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-6 p-4">
          <section className="flex min-w-0 flex-col gap-2">
            <Label>Filters</Label>
            <div className="flex min-w-0 flex-wrap gap-2 rounded-md border px-3 py-2 text-sm">
              {runScope.data.filter.length > 0 ? (
                <InlineFilterState
                  filterState={runScope.data.filter}
                  className="ml-0 max-w-full"
                />
              ) : (
                <span className="text-muted-foreground">All observations</span>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <Label>Sampling</Label>
            <div className="w-fit rounded-md border px-3 py-2 text-sm font-medium">
              {Math.round(runScope.data.sampling * 100)}%
            </div>
          </section>

          <section className="flex min-w-0 flex-col gap-2">
            <Label>Matching observations</Label>
            <ScopePreviewTable
              projectId={projectId}
              filterState={runScope.data.filter}
              timeRange={absoluteTimeRange}
            />
          </section>

          <section className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Label>Attached evaluators</Label>
                <Badge variant="secondary" size="sm">
                  {runScope.data.evaluators.length}
                </Badge>
              </div>
              <Popover
                open={evaluatorPickerOpen}
                onOpenChange={setEvaluatorPickerOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!hasWriteAccess}
                  >
                    <Link2 className="mr-1.5 h-3.5 w-3.5" />
                    Attach evaluator
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-0">
                  <Command>
                    <CommandInput placeholder="Find an evaluator..." />
                    <CommandList>
                      <CommandEmpty>
                        No unattached evaluator found.
                      </CommandEmpty>
                      <CommandGroup heading="Continue in evaluator setup">
                        {availableEvaluators.map((evaluator) => (
                          <CommandItem
                            key={evaluator.id}
                            value={`${evaluator.scoreName} ${evaluator.id}`}
                            onSelect={() => openEvaluatorEdit(evaluator.id)}
                          >
                            <span
                              className="min-w-0 flex-1 truncate"
                              title={evaluator.scoreName}
                            >
                              {evaluator.scoreName}
                            </span>
                            <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <RunScopeEvaluatorConnections
              projectId={projectId}
              runScopeId={runScope.data.id}
              evaluators={runScope.data.evaluators}
              hasWriteAccess={hasWriteAccess}
            />
          </section>
        </div>
      )}
    </TablePeekView>
  );
}
