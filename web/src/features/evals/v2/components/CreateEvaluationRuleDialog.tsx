import { useMemo, useState } from "react";
import { ArrowLeft, Link2, X } from "lucide-react";

import { usePeekData } from "@/src/components/table/peek/hooks/usePeekData";
import {
  TraceDetailBody,
  traceDetailTitle,
} from "@/src/components/trace/TraceDetailBody";
import { Button } from "@/src/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Slider } from "@/src/components/ui/slider";
import { EvaluationRuleAttachmentValidationAlert } from "@/src/features/evals/v2/components/EvaluationRuleAttachmentValidationAlert";
import { EvaluationRuleAttachmentValidationDialog } from "@/src/features/evals/v2/components/EvaluationRuleAttachmentValidationDialog";
import { EvaluationRuleFieldLabel } from "@/src/features/evals/v2/components/EvaluationRuleFieldLabel";
import {
  EVALUATION_OBSERVATION_EXCLUSION_FILTERS,
  EXAMPLE_FILTERS,
  generateEvaluationRuleName,
  mergeExampleFilters,
  RuleFilterSearchBar,
} from "@/src/features/evals/v2/components/EvaluationRuleSection";
import { EvaluationRulePreviewTable } from "@/src/features/evals/v2/components/EvaluationRulePreviewTable";
import { SetupStep } from "@/src/features/evals/v2/components/SetupStep";
import { useValidatedRuleDraftEvaluator } from "@/src/features/evals/v2/hooks/useValidatedRuleDraftEvaluator";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { api } from "@/src/utils/api";
import { toAbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { type FilterState } from "@langfuse/shared";

export function CreateEvaluationRuleDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = api.useUtils();
  const [observationsOpen, setObservationsOpen] = useState(true);
  const [samplingOpen, setSamplingOpen] = useState(false);
  const [evaluatorOpen, setEvaluatorOpen] = useState(true);
  const [nameOpen, setNameOpen] = useState(false);
  const [name, setName] = useState("");
  const [nameCustomized, setNameCustomized] = useState(false);
  const [filterState, setFilterState] = useState<FilterState>(() => [
    ...EVALUATION_OBSERVATION_EXCLUSION_FILTERS,
  ]);
  const [sampling, setSampling] = useState(1);
  const [selectedEvaluatorIds, setSelectedEvaluatorIds] = useState<string[]>(
    [],
  );
  const [validatedEvaluatorIds, setValidatedEvaluatorIds] = useState<string[]>(
    [],
  );
  const [evaluatorPickerOpen, setEvaluatorPickerOpen] = useState(false);
  const [traceId, setTraceId] = useState<string | null>(null);
  const validation = useValidatedRuleDraftEvaluator({ projectId });
  const trace = usePeekData({
    projectId,
    traceId: traceId ?? undefined,
  });
  const { timeRange } = useTableDateRange(projectId);
  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange),
    [timeRange],
  );
  const rules = api.evalsV2.rules.useQuery({ projectId }, { enabled: open });
  const evaluatorOptions = api.evalsV2.evaluatorOptions.useQuery(
    { projectId },
    { enabled: open && evaluatorOpen },
  );
  const selectedEvaluators = selectedEvaluatorIds.flatMap((evaluatorId) => {
    const evaluator = evaluatorOptions.data?.find(
      (candidate) => candidate.id === evaluatorId,
    );
    return evaluator ? [evaluator] : [];
  });
  const evaluatorsValidated =
    selectedEvaluatorIds.length > 0 &&
    selectedEvaluatorIds.every((evaluatorId) =>
      validatedEvaluatorIds.includes(evaluatorId),
    );
  const availableEvaluators = (evaluatorOptions.data ?? []).filter(
    (evaluator) => evaluator.targetObject === "event",
  );
  const unattachedEvaluators = availableEvaluators.filter(
    (evaluator) => !selectedEvaluatorIds.includes(evaluator.id),
  );
  const createRule = api.evalsV2.createRule.useMutation({
    onError: (error) => trpcErrorToast(error),
  });

  const updateFilters = (nextFilters: FilterState) => {
    setFilterState(nextFilters);
    setValidatedEvaluatorIds([]);
    setNameOpen(false);
    validation.resetIssue();
  };

  const validateEvaluator = async (evaluatorId: string) => {
    if (selectedEvaluatorIds.includes(evaluatorId)) {
      const nextSelectedIds = selectedEvaluatorIds.filter(
        (selectedId) => selectedId !== evaluatorId,
      );
      setSelectedEvaluatorIds(nextSelectedIds);
      setValidatedEvaluatorIds((current) =>
        current.filter((validatedId) => validatedId !== evaluatorId),
      );
      if (nextSelectedIds.length === 0) setNameOpen(false);
      validation.resetIssue();
      setEvaluatorPickerOpen(false);
      return;
    }

    const nextSelectedIds = [...selectedEvaluatorIds, evaluatorId];
    setSelectedEvaluatorIds(nextSelectedIds);
    validation.resetIssue();
    setEvaluatorPickerOpen(false);

    const valid = await validation.validate({
      evaluatorId,
      filter: filterState,
    });
    if (!valid) return;

    const nextValidatedIds = [...validatedEvaluatorIds, evaluatorId];
    setValidatedEvaluatorIds(nextValidatedIds);
    if (!nameCustomized) {
      setName(
        generateEvaluationRuleName({
          filter: filterState,
          targetObject: "event",
          existingNames: (rules.data ?? []).map((rule) => rule.name),
        }),
      );
    }
    setNameOpen(true);
  };

  const validateSelectedEvaluators = async () => {
    const validatedIds: string[] = [];
    for (const evaluatorId of selectedEvaluatorIds) {
      const valid = await validation.validate({
        evaluatorId,
        filter: filterState,
      });
      if (!valid) {
        setValidatedEvaluatorIds(validatedIds);
        return;
      }
      validatedIds.push(evaluatorId);
    }

    setValidatedEvaluatorIds(validatedIds);
    if (!nameCustomized) {
      setName(
        generateEvaluationRuleName({
          filter: filterState,
          targetObject: "event",
          existingNames: (rules.data ?? []).map((rule) => rule.name),
        }),
      );
    }
    setNameOpen(true);
  };

  const create = async () => {
    if (!evaluatorsValidated) return;
    try {
      await createRule.mutateAsync({
        projectId,
        name: name.trim(),
        targetObject: "event",
        filter: filterState,
        sampling,
        enabled: true,
        evaluatorIds: selectedEvaluatorIds,
      });
    } catch {
      return;
    }

    await Promise.all([
      utils.evalsV2.rules.invalidate({ projectId }),
      utils.evalsV2.invalidate(),
    ]).catch(() => undefined);
    showSuccessToast({
      title: "Rule created",
      description:
        selectedEvaluators.length === 1
          ? `${name.trim()} is active with ${selectedEvaluators[0]?.scoreName ?? "the evaluator"} attached.`
          : `${name.trim()} is active with ${selectedEvaluators.length} evaluators attached.`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size={traceId ? "xxl" : "xl"}
        className={traceId ? undefined : "max-w-6xl"}
      >
        <DialogHeader>
          {traceId ? (
            <div className="flex min-w-0 items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Back to new rule"
                onClick={() => setTraceId(null)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <DialogTitle
                className="truncate"
                title={traceDetailTitle(trace.data, traceId)}
              >
                {traceDetailTitle(trace.data, traceId)}
              </DialogTitle>
            </div>
          ) : (
            <>
              <DialogTitle>New rule</DialogTitle>
              <DialogDescription>
                Define what data is evaluated, attach evaluators, then name the
                rule.
              </DialogDescription>
            </>
          )}
        </DialogHeader>

        <EvaluationRuleAttachmentValidationDialog
          open={validation.pendingEvaluatorId !== null}
        />

        {traceId ? (
          <DialogBody className="min-h-0 gap-0 p-0">
            <TraceDetailBody trace={trace.data} context="peek" />
          </DialogBody>
        ) : (
          <DialogBody className="gap-3">
            <SetupStep
              number={1}
              title="Choose observations"
              open={observationsOpen}
              onOpenChange={setObservationsOpen}
            >
              <div className="flex flex-col gap-6">
                <section className="flex min-w-0 flex-col gap-2">
                  <EvaluationRuleFieldLabel tooltip="Only matching observations are evaluated. Add filters to narrow the incoming data included.">
                    Filters
                  </EvaluationRuleFieldLabel>
                  <RuleFilterSearchBar
                    projectId={projectId}
                    filterState={filterState}
                    setFilterState={updateFilters}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    {EXAMPLE_FILTERS.map((example) => (
                      <Button
                        key={example.label}
                        type="button"
                        variant="outline"
                        onClick={() =>
                          updateFilters(
                            mergeExampleFilters(filterState, example.filters),
                          )
                        }
                      >
                        <example.icon className="mr-1.5 h-3.5 w-3.5" />
                        {example.label}
                      </Button>
                    ))}
                  </div>
                </section>

                <section className="flex min-w-0 flex-col gap-2">
                  <EvaluationRuleFieldLabel tooltip="Preview recent observations that currently match this rule.">
                    Matching observations
                  </EvaluationRuleFieldLabel>
                  <EvaluationRulePreviewTable
                    projectId={projectId}
                    filterState={filterState}
                    timeRange={absoluteTimeRange}
                    onSelectObservation={(row) => {
                      if (row.traceId) setTraceId(row.traceId);
                    }}
                  />
                </section>
              </div>
            </SetupStep>

            <SetupStep
              number={2}
              title="Set sampling rate"
              open={samplingOpen}
              onOpenChange={setSamplingOpen}
            >
              <div className="flex flex-col gap-2">
                <EvaluationRuleFieldLabel tooltip="The share of matching observations to evaluate. 100% evaluates every match.">
                  Sampling
                </EvaluationRuleFieldLabel>
                <Slider
                  min={0.0001}
                  max={1}
                  step={0.0001}
                  value={[sampling]}
                  onValueChange={(value) => {
                    setSampling(value[0] ?? sampling);
                    setValidatedEvaluatorIds([]);
                    setNameOpen(false);
                    validation.resetIssue();
                  }}
                  showInput
                  displayAsPercentage
                />
              </div>
            </SetupStep>

            <SetupStep
              number={3}
              title="Attach evaluator"
              open={evaluatorOpen}
              onOpenChange={setEvaluatorOpen}
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <EvaluationRuleFieldLabel tooltip="Choose what should run on observations matched by this rule.">
                    Evaluators
                  </EvaluationRuleFieldLabel>
                  <Popover
                    open={evaluatorPickerOpen}
                    onOpenChange={setEvaluatorPickerOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        aria-label="Attach evaluator"
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
                            {unattachedEvaluators.map((evaluator) => (
                              <CommandItem
                                key={evaluator.id}
                                value={`${evaluator.scoreName} ${evaluator.id}`}
                                onSelect={() =>
                                  validateEvaluator(evaluator.id).catch(
                                    () => undefined,
                                  )
                                }
                              >
                                <span
                                  className="truncate"
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
                {selectedEvaluators.length > 0 ? (
                  <ul
                    className="divide-border divide-y overflow-hidden rounded-md border"
                    aria-label="Selected evaluators"
                  >
                    {selectedEvaluators.map((evaluator) => (
                      <li
                        key={evaluator.id}
                        className="flex min-w-0 items-center px-1 py-1 text-sm"
                      >
                        <span
                          className="min-w-0 flex-1 truncate px-2"
                          title={evaluator.scoreName}
                        >
                          {evaluator.scoreName}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove ${evaluator.scoreName}`}
                          onClick={() =>
                            validateEvaluator(evaluator.id).catch(
                              () => undefined,
                            )
                          }
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-sm">
                    No evaluators attached yet.
                  </div>
                )}
                {selectedEvaluatorIds.length > 0 && !evaluatorsValidated ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="self-start"
                    loading={validation.pendingEvaluatorId !== null}
                    onClick={() =>
                      validateSelectedEvaluators().catch(() => undefined)
                    }
                  >
                    Validate selected evaluators
                  </Button>
                ) : null}
                {validation.issue ? (
                  <EvaluationRuleAttachmentValidationAlert
                    projectId={projectId}
                    evaluatorId={validation.issue.evaluatorId}
                    issue={validation.issue}
                  />
                ) : null}
              </div>
            </SetupStep>

            <SetupStep
              number={4}
              title="Name rule"
              open={nameOpen}
              isLast
              onOpenChange={setNameOpen}
            >
              <div className="flex flex-col gap-2">
                <EvaluationRuleFieldLabel
                  htmlFor="new-evaluation-rule-name"
                  tooltip="Use a short, recognizable name for this rule."
                >
                  Name
                </EvaluationRuleFieldLabel>
                <Input
                  id="new-evaluation-rule-name"
                  value={name}
                  placeholder="e.g. Production observations"
                  onChange={(event) => {
                    setName(event.target.value);
                    setNameCustomized(true);
                  }}
                  autoFocus
                />
                <p className="text-muted-foreground text-xs">
                  The rule becomes active when it is created.
                </p>
              </div>
            </SetupStep>
          </DialogBody>
        )}

        {!traceId ? (
          <DialogFooter className="px-6 py-4">
            <Button
              type="button"
              variant="outline"
              disabled={createRule.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              loading={createRule.isPending}
              disabled={!name.trim() || !evaluatorsValidated}
              onClick={() => create().catch(() => undefined)}
            >
              Save
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
