import { useMemo, useState } from "react";
import { ArrowLeft, Link2 } from "lucide-react";

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

type RuleCreationStep = "observations" | "evaluator" | "name";

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
  const [activeStep, setActiveStep] =
    useState<RuleCreationStep>("observations");
  const [evaluatorStepAvailable, setEvaluatorStepAvailable] = useState(false);
  const [name, setName] = useState("");
  const [nameCustomized, setNameCustomized] = useState(false);
  const [filterState, setFilterState] = useState<FilterState>(() => [
    ...EVALUATION_OBSERVATION_EXCLUSION_FILTERS,
  ]);
  const [sampling, setSampling] = useState(1);
  const [selectedEvaluatorId, setSelectedEvaluatorId] = useState<string | null>(
    null,
  );
  const [validatedEvaluatorId, setValidatedEvaluatorId] = useState<
    string | null
  >(null);
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
    { enabled: open && evaluatorStepAvailable },
  );
  const selectedEvaluator = evaluatorOptions.data?.find(
    (evaluator) => evaluator.id === selectedEvaluatorId,
  );
  const evaluatorValidated =
    selectedEvaluatorId !== null &&
    selectedEvaluatorId === validatedEvaluatorId;
  const availableEvaluators = (evaluatorOptions.data ?? []).filter(
    (evaluator) => evaluator.targetObject === "event",
  );
  const createRule = api.evalsV2.createRule.useMutation({
    onError: (error) => trpcErrorToast(error),
  });

  const updateFilters = (nextFilters: FilterState) => {
    setFilterState(nextFilters);
    setValidatedEvaluatorId(null);
    validation.resetIssue();
  };

  const openEvaluatorStep = () => {
    setEvaluatorStepAvailable(true);
    setActiveStep("evaluator");
  };

  const validateEvaluator = async (evaluatorId: string) => {
    setSelectedEvaluatorId(evaluatorId);
    setValidatedEvaluatorId(null);
    validation.resetIssue();
    setEvaluatorPickerOpen(false);

    const valid = await validation.validate({
      evaluatorId,
      filter: filterState,
    });
    if (!valid) return;

    setValidatedEvaluatorId(evaluatorId);
    if (!nameCustomized) {
      setName(
        generateEvaluationRuleName({
          filter: filterState,
          targetObject: "event",
          existingNames: (rules.data ?? []).map((rule) => rule.name),
        }),
      );
    }
    setActiveStep("name");
  };

  const create = async () => {
    if (!selectedEvaluator || !evaluatorValidated) return;
    try {
      await createRule.mutateAsync({
        projectId,
        name: name.trim(),
        targetObject: "event",
        filter: filterState,
        sampling,
        enabled: true,
        evaluatorId: selectedEvaluator.id,
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
      description: `${name.trim()} is active with ${selectedEvaluator.scoreName} attached.`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size={traceId ? "xxl" : "lg"}>
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
                Define what data is evaluated, choose an evaluator, then name
                the rule.
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
              summary={`${Math.round(sampling * 100)}% sampling`}
              open={activeStep === "observations"}
              onOpenChange={(nextOpen) => {
                if (nextOpen) setActiveStep("observations");
              }}
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

                <section className="flex flex-col gap-2">
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
                      setValidatedEvaluatorId(null);
                      validation.resetIssue();
                    }}
                    showInput
                    displayAsPercentage
                  />
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
              title="Select evaluator"
              summary={
                selectedEvaluator
                  ? evaluatorValidated
                    ? selectedEvaluator.scoreName
                    : `${selectedEvaluator.scoreName} · Needs validation`
                  : "Required"
              }
              open={activeStep === "evaluator"}
              disabled={!evaluatorStepAvailable}
              onOpenChange={(nextOpen) => {
                if (nextOpen) setActiveStep("evaluator");
              }}
            >
              <div className="flex flex-col gap-3">
                <p className="text-muted-foreground text-sm">
                  Choose what should run on observations matched by this rule.
                </p>
                <Popover
                  open={evaluatorPickerOpen}
                  onOpenChange={setEvaluatorPickerOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-between"
                    >
                      <span
                        className="truncate"
                        title={selectedEvaluator?.scoreName}
                      >
                        {selectedEvaluator?.scoreName ?? "Select evaluator"}
                      </span>
                      <Link2 className="ml-2 h-3.5 w-3.5 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-(--radix-popover-trigger-width) p-0"
                  >
                    <Command>
                      <CommandInput placeholder="Find an evaluator..." />
                      <CommandList>
                        <CommandEmpty>No evaluator found.</CommandEmpty>
                        <CommandGroup heading="Available evaluators">
                          {availableEvaluators.map((evaluator) => (
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
                {selectedEvaluator && !evaluatorValidated ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="self-start"
                    loading={
                      validation.pendingEvaluatorId === selectedEvaluator.id
                    }
                    onClick={() =>
                      validateEvaluator(selectedEvaluator.id).catch(
                        () => undefined,
                      )
                    }
                  >
                    Validate evaluator
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
              number={3}
              title="Name rule"
              summary={name || "Available after evaluator validation"}
              open={activeStep === "name"}
              disabled={!evaluatorValidated}
              isLast
              onOpenChange={(nextOpen) => {
                if (nextOpen) setActiveStep("name");
              }}
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
            {activeStep === "observations" ? (
              <Button type="button" onClick={openEvaluatorStep}>
                Continue
              </Button>
            ) : activeStep === "name" ? (
              <Button
                type="button"
                loading={createRule.isPending}
                disabled={!name.trim() || !evaluatorValidated}
                onClick={() => create().catch(() => undefined)}
              >
                Create rule and attach evaluator
              </Button>
            ) : null}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
