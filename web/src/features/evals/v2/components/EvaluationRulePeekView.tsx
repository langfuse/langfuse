import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Link2,
} from "lucide-react";

import { TablePeekView } from "@/src/components/table/peek";
import {
  TraceDetailBody,
  traceDetailTitle,
} from "@/src/components/trace/TraceDetailBody";
import { usePeekData } from "@/src/components/table/peek/hooks/usePeekData";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Skeleton } from "@/src/components/ui/skeleton";
import { DeleteEvaluationRuleButton } from "@/src/features/evals/v2/components/DeleteEvaluationRuleButton";
import { EvaluationRuleEditView } from "@/src/features/evals/v2/components/EvaluationRuleEditView";
import { EvaluationRuleEvaluatorConnections } from "@/src/features/evals/v2/components/EvaluationRuleEvaluatorConnections";
import { EvaluationRuleFieldLabel } from "@/src/features/evals/v2/components/EvaluationRuleFieldLabel";
import {
  EvaluationRuleConfigurationSteps,
  EvaluationRuleSamplingField,
} from "@/src/features/evals/v2/components/EvaluationRuleForm";
import { EvaluationRulePreviewTable } from "@/src/features/evals/v2/components/EvaluationRulePreviewTable";
import { EvaluationRuleAttachmentValidationAlert } from "@/src/features/evals/v2/components/EvaluationRuleAttachmentValidationAlert";
import { EvaluationRuleAttachmentValidationDialog } from "@/src/features/evals/v2/components/EvaluationRuleAttachmentValidationDialog";
import { useValidatedRuleAttachment } from "@/src/features/evals/v2/hooks/useValidatedRuleAttachment";
import { ruleTimeRangeFilter } from "@/src/features/evals/v2/lib/useRuleMatchCount";
import { InlineFilterState } from "@/src/features/filters/components/filter-builder";
import { encodeFiltersGeneric } from "@/src/features/filters/lib/filter-query-encoding";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { api } from "@/src/utils/api";
import { toAbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { usdFormatter } from "@/src/utils/numbers";
import { cn } from "@/src/utils/tailwind";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

export function TablePeekViewEvaluationRuleDetail({
  projectId,
  ...peekProps
}: Omit<React.ComponentProps<typeof TablePeekView>, "children" | "title"> & {
  projectId: string;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const ruleId = router.query.peek as string | undefined;
  const [evaluatorPickerOpen, setEvaluatorPickerOpen] = useState(false);
  const [statusDetailsOpen, setStatusDetailsOpen] = useState(false);
  const [inspectedTraceId, setInspectedTraceId] = useState<string | null>(null);
  const [formResetKey, setFormResetKey] = useState(0);
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:CUD",
  });
  const evaluationRule = api.evalsV2.ruleById.useQuery(
    { projectId, ruleId: ruleId ?? "" },
    { enabled: Boolean(projectId && ruleId) },
  );
  const inspectedTrace = usePeekData({
    projectId,
    traceId: inspectedTraceId ?? undefined,
  });
  const ruleCosts = api.evalsV2.ruleCosts.useQuery(
    { projectId, ruleIds: ruleId ? [ruleId] : [] },
    { enabled: Boolean(projectId && ruleId) },
  );
  const evaluatorOptions = api.evalsV2.evaluatorOptions.useQuery(
    { projectId },
    {
      enabled: Boolean(projectId) && evaluatorPickerOpen && hasWriteAccess,
    },
  );
  const attachment = useValidatedRuleAttachment({
    projectId,
    entryPoint: "evaluation_rule_detail",
  });
  const setEnabled = api.evalsV2.setRulesEnabled.useMutation({
    onError: (error) => trpcErrorToast(error),
    onSuccess: async (_data, variables) => {
      showSuccessToast({
        title: variables.enabled ? "Rule enabled" : "Rule disabled",
        description: "The evaluation rule was updated.",
      });
      await Promise.all([utils.evals.invalidate(), utils.evalsV2.invalidate()]);
    },
  });
  const { timeRange } = useTableDateRange(projectId);
  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange),
    [timeRange],
  );

  const attachedEvaluatorIds = new Set(
    evaluationRule.data?.evaluators.map((evaluator) => evaluator.id) ?? [],
  );
  const availableEvaluators = (evaluatorOptions.data ?? []).filter(
    (evaluator) =>
      evaluator.targetObject === evaluationRule.data?.targetObject &&
      !attachedEvaluatorIds.has(evaluator.id),
  );
  const totalCost = evaluationRule.data
    ? ruleCosts.data?.[evaluationRule.data.id]
    : undefined;
  const createdBy =
    evaluationRule.data?.createdByUser?.name ??
    evaluationRule.data?.createdByUser?.email ??
    "Unknown";

  const ruleActions =
    hasWriteAccess && evaluationRule.data ? (
      <DeleteEvaluationRuleButton
        projectId={projectId}
        evaluationRule={{
          id: evaluationRule.data.id,
          name: evaluationRule.data.name,
          evaluatorCount: evaluationRule.data.evaluators.length,
        }}
        variant="ghost"
        iconOnly
        onDeleted={peekProps.closePeek}
      />
    ) : undefined;
  const inspectedTraceActions = inspectedTraceId ? (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label="Back to evaluation rule"
      onClick={() => setInspectedTraceId(null)}
    >
      <ArrowLeft className="h-4 w-4" />
    </Button>
  ) : undefined;

  const ruleActionsMenu =
    hasWriteAccess && evaluationRule.data ? (
      <div className="flex w-full flex-col gap-0.5">
        <DeleteEvaluationRuleButton
          projectId={projectId}
          evaluationRule={{
            id: evaluationRule.data.id,
            name: evaluationRule.data.name,
            evaluatorCount: evaluationRule.data.evaluators.length,
          }}
          size="sm"
          className="w-full justify-start font-normal"
          onDeleted={peekProps.closePeek}
        />
      </div>
    ) : undefined;

  return (
    <TablePeekView
      {...peekProps}
      closePeek={
        inspectedTraceId ? () => setInspectedTraceId(null) : peekProps.closePeek
      }
      title={
        inspectedTraceId
          ? traceDetailTitle(inspectedTrace.data, inspectedTraceId)
          : (evaluationRule.data?.name ?? "Evaluation rule")
      }
      actions={inspectedTraceId ? inspectedTraceActions : ruleActions}
      actionsMenu={inspectedTraceId ? undefined : ruleActionsMenu}
    >
      <EvaluationRuleAttachmentValidationDialog
        open={attachment.pendingKey !== null}
      />
      {inspectedTraceId ? (
        <TraceDetailBody trace={inspectedTrace.data} context="peek" />
      ) : evaluationRule.isError ? (
        <p className="text-muted-foreground p-4 text-sm">
          This evaluation rule could not be loaded.
        </p>
      ) : evaluationRule.isPending || !evaluationRule.data ? (
        <div className="flex flex-col gap-4 p-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-52 w-full" />
        </div>
      ) : hasWriteAccess ? (
        <EvaluationRuleEditView
          key={`${evaluationRule.data.id}-${formResetKey}`}
          projectId={projectId}
          evaluationRule={evaluationRule.data}
          timeRange={absoluteTimeRange}
          onCancel={peekProps.closePeek}
          onSaved={() => setFormResetKey((key) => key + 1)}
          onOpenTrace={setInspectedTraceId}
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-6 p-4">
          <Collapsible
            open={statusDetailsOpen}
            onOpenChange={setStatusDetailsOpen}
            className={cn(
              "relative rounded-md border p-3",
              statusDetailsOpen
                ? "grid w-full gap-4 sm:grid-cols-3"
                : "flex w-fit items-center gap-3 pr-10",
            )}
          >
            <div
              className={cn(
                "flex",
                statusDetailsOpen
                  ? "flex-col gap-2 sm:col-span-3"
                  : "items-center gap-3",
              )}
            >
              <EvaluationRuleFieldLabel
                htmlFor="evaluation-rule-enabled"
                tooltip="Lets attached evaluators run on matching incoming observations."
              >
                Enabled
              </EvaluationRuleFieldLabel>
              <Switch
                id="evaluation-rule-enabled"
                checked={evaluationRule.data.enabled}
                disabled={!hasWriteAccess || setEnabled.isPending}
                onCheckedChange={(enabled) =>
                  setEnabled.mutate({
                    projectId,
                    ruleIds: [evaluationRule.data.id],
                    enabled,
                  })
                }
                aria-label={`${evaluationRule.data.enabled ? "Disable" : "Enable"} ${evaluationRule.data.name}`}
                color="green"
              />
            </div>

            <CollapsibleContent
              className={statusDetailsOpen ? "contents" : undefined}
            >
              <div className="flex flex-col gap-1">
                <Label>Created by</Label>
                <span className="text-sm">{createdBy}</span>
              </div>
              <div className="flex flex-col gap-1">
                <Label>Last updated</Label>
                <span className="text-sm tabular-nums">
                  {evaluationRule.data.updatedAt.toLocaleString()}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <Label>Total cost (7d)</Label>
                <span className="text-sm tabular-nums">
                  {ruleCosts.isPending ? (
                    <Skeleton className="h-4 w-16" />
                  ) : totalCost == null ? (
                    "–"
                  ) : (
                    usdFormatter(totalCost, 2, 4)
                  )}
                </span>
              </div>
            </CollapsibleContent>

            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="absolute top-2 right-2"
                aria-label={
                  statusDetailsOpen
                    ? "Collapse rule details"
                    : "Expand rule details"
                }
              >
                {statusDetailsOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          </Collapsible>

          <EvaluationRuleConfigurationSteps
            observations={
              <div className="flex flex-col gap-6">
                <section className="flex min-w-0 flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <EvaluationRuleFieldLabel tooltip="Only matching observations are evaluated. Add filters to narrow the incoming data included.">
                      Filters
                    </EvaluationRuleFieldLabel>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        router
                          .push({
                            pathname: `/project/${projectId}/traces`,
                            query: {
                              filter: encodeFiltersGeneric([
                                ...evaluationRule.data.filter,
                                ...ruleTimeRangeFilter(absoluteTimeRange),
                              ]),
                            },
                          })
                          .catch(() => undefined)
                      }
                    >
                      View matches
                      <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      {evaluationRule.data.filter.length > 0 ? (
                        <InlineFilterState
                          filterState={evaluationRule.data.filter}
                          className="max-w-full first:ml-0"
                        />
                      ) : (
                        <span className="text-muted-foreground">
                          All observations
                        </span>
                      )}
                    </div>
                  </div>
                </section>
                <section className="flex min-w-0 flex-col gap-2">
                  <EvaluationRuleFieldLabel tooltip="Preview recent observations that currently match this rule.">
                    Matching observations
                  </EvaluationRuleFieldLabel>
                  <EvaluationRulePreviewTable
                    projectId={projectId}
                    filterState={evaluationRule.data.filter}
                    timeRange={absoluteTimeRange}
                    columnVisibilityStorageKeySuffix="view-rule"
                    onSelectObservation={(row) => {
                      if (row.traceId) setInspectedTraceId(row.traceId);
                    }}
                  />
                  <EvaluationRuleSamplingField
                    sampling={evaluationRule.data.sampling}
                  />
                </section>
              </div>
            }
            evaluators={
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <EvaluationRuleFieldLabel tooltip="Evaluators that run on observations matched by this rule.">
                      Evaluators
                    </EvaluationRuleFieldLabel>
                    <Badge variant="secondary" size="sm">
                      {evaluationRule.data.evaluators.length}
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
                        loading={attachment.pendingKey !== null}
                        disabled={
                          !hasWriteAccess || attachment.pendingKey !== null
                        }
                      >
                        Attach evaluator
                        <Link2 className="ml-1.5 h-3.5 w-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-80 p-0">
                      <Command>
                        <CommandInput placeholder="Find an evaluator..." />
                        <CommandList>
                          <CommandEmpty>
                            No unattached evaluator found.
                          </CommandEmpty>
                          <CommandGroup heading="Available evaluators">
                            {availableEvaluators.map((evaluator) => (
                              <CommandItem
                                key={evaluator.id}
                                value={`${evaluator.scoreName} ${evaluator.id}`}
                                onSelect={() => {
                                  if (!ruleId) return;
                                  setEvaluatorPickerOpen(false);
                                  attachment
                                    .attach({
                                      evaluatorId: evaluator.id,
                                      ruleId,
                                      evaluatorName: evaluator.scoreName,
                                      evaluationRuleName:
                                        evaluationRule.data.name,
                                    })
                                    .catch(() => undefined);
                                }}
                              >
                                <span
                                  className="min-w-0 flex-1 truncate"
                                  title={evaluator.scoreName}
                                >
                                  {evaluator.scoreName}
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                {attachment.issue ? (
                  <EvaluationRuleAttachmentValidationAlert
                    projectId={projectId}
                    evaluatorId={attachment.issue.evaluatorId}
                    ruleId={attachment.issue.ruleId}
                    issue={attachment.issue}
                  />
                ) : null}
                <EvaluationRuleEvaluatorConnections
                  projectId={projectId}
                  ruleId={evaluationRule.data.id}
                  evaluators={evaluationRule.data.evaluators}
                  hasWriteAccess={hasWriteAccess}
                />
              </div>
            }
            name={
              <div className="flex flex-col gap-2">
                <EvaluationRuleFieldLabel
                  htmlFor="view-evaluation-rule-name"
                  tooltip="The recognizable name of this rule."
                >
                  Name
                </EvaluationRuleFieldLabel>
                <Input
                  id="view-evaluation-rule-name"
                  value={evaluationRule.data.name}
                  readOnly
                />
              </div>
            }
          />
        </div>
      )}
    </TablePeekView>
  );
}
