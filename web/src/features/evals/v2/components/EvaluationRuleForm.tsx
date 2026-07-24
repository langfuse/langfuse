import { useState, type ReactNode } from "react";
import { ChevronDown, Link2, X } from "lucide-react";
import { type FilterState } from "@langfuse/shared";

import { Button } from "@/src/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import { Input } from "@/src/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Slider } from "@/src/components/ui/slider";
import { EvaluationRuleFieldLabel } from "@/src/features/evals/v2/components/EvaluationRuleFieldLabel";
import { EvaluationRulePreviewTable } from "@/src/features/evals/v2/components/EvaluationRulePreviewTable";
import {
  EXAMPLE_FILTERS,
  mergeExampleFilters,
  RuleFilterSearchBar,
} from "@/src/features/evals/v2/components/EvaluationRuleSection";
import { SetupStep } from "@/src/features/evals/v2/components/SetupStep";
import { type AbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { cn } from "@/src/utils/tailwind";

export type EvaluationRuleFormEvaluator = {
  id: string;
  scoreName: string;
};

export function EvaluationRuleSamplingField({
  sampling,
  onSamplingChange,
}: {
  sampling: number;
  onSamplingChange?: (sampling: number) => void;
}) {
  const [samplingOpen, setSamplingOpen] = useState(false);
  const percentage = (sampling * 100).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });

  return (
    <>
      <button
        type="button"
        className="flex w-fit items-center gap-1.5 text-sm"
        aria-label={`Sampling ${percentage}%`}
        aria-expanded={samplingOpen}
        onClick={() => setSamplingOpen((current) => !current)}
      >
        <ChevronDown
          className={cn(
            "text-muted-foreground h-4 w-4 transition-transform",
            !samplingOpen && "-rotate-90",
          )}
        />
        Sampling
        <span className="text-muted-foreground ml-1.5 font-normal">
          {percentage}%
        </span>
      </button>
      {samplingOpen ? (
        <div className="flex w-full max-w-md flex-col gap-2 pl-[22px]">
          <p className="text-muted-foreground text-xs">
            Choose the share of matching observations to evaluate.
          </p>
          <Slider
            min={0.0001}
            max={1}
            step={0.0001}
            value={[sampling]}
            disabled={!onSamplingChange}
            onValueChange={
              onSamplingChange
                ? (value) => onSamplingChange(value[0] ?? sampling)
                : undefined
            }
            showInput
            displayAsPercentage
          />
        </div>
      ) : null}
    </>
  );
}

export function EvaluationRuleConfigurationSteps({
  observations,
  evaluators,
  name,
  nameOpen,
  defaultNameOpen = true,
  onNameOpenChange,
}: {
  observations: ReactNode;
  evaluators: ReactNode;
  name: ReactNode;
  nameOpen?: boolean;
  defaultNameOpen?: boolean;
  onNameOpenChange?: (open: boolean) => void;
}) {
  const [observationsOpen, setObservationsOpen] = useState(true);
  const [evaluatorOpen, setEvaluatorOpen] = useState(true);

  return (
    <div className="flex flex-col gap-3">
      <SetupStep
        number={1}
        title="Choose observations"
        description="Filter incoming observations and preview what this rule will evaluate."
        compactBottomSpacing
        open={observationsOpen}
        onOpenChange={setObservationsOpen}
      >
        {observations}
      </SetupStep>
      <SetupStep
        number={2}
        title="Attach evaluator"
        description="Choose which evaluators should run on matching observations."
        open={evaluatorOpen}
        onOpenChange={setEvaluatorOpen}
      >
        {evaluators}
      </SetupStep>
      <SetupStep
        number={3}
        title="Name rule"
        description="Give this rule a clear name so it is easy to recognize."
        isLast
        defaultOpen={defaultNameOpen}
        open={nameOpen}
        onOpenChange={onNameOpenChange}
      >
        {name}
      </SetupStep>
    </div>
  );
}

export function EvaluationRuleForm({
  projectId,
  name,
  onNameChange,
  filterState,
  onFilterStateChange,
  sampling,
  onSamplingChange,
  evaluators,
  availableEvaluators,
  onToggleEvaluator,
  timeRange,
  onOpenTrace,
  validationContent,
  validationRequired = false,
  validating = false,
  onValidateEvaluators,
  nameOpen,
  defaultNameOpen = true,
  onNameOpenChange,
  nameHint,
  idPrefix,
  columnVisibilityStorageKeySuffix,
}: {
  projectId: string;
  name: string;
  onNameChange: (name: string) => void;
  filterState: FilterState;
  onFilterStateChange: (filterState: FilterState) => void;
  sampling: number;
  onSamplingChange: (sampling: number) => void;
  evaluators: EvaluationRuleFormEvaluator[];
  availableEvaluators: EvaluationRuleFormEvaluator[];
  onToggleEvaluator: (evaluatorId: string) => void | Promise<void>;
  timeRange: AbsoluteTimeRange | null;
  onOpenTrace: (traceId: string) => void;
  validationContent?: ReactNode;
  validationRequired?: boolean;
  validating?: boolean;
  onValidateEvaluators?: () => void | Promise<void>;
  nameOpen?: boolean;
  defaultNameOpen?: boolean;
  onNameOpenChange?: (open: boolean) => void;
  nameHint: ReactNode;
  idPrefix: string;
  columnVisibilityStorageKeySuffix: string;
}) {
  const [evaluatorPickerOpen, setEvaluatorPickerOpen] = useState(false);
  const selectedEvaluatorIds = new Set(
    evaluators.map((evaluator) => evaluator.id),
  );
  const unattachedEvaluators = availableEvaluators.filter(
    (evaluator) => !selectedEvaluatorIds.has(evaluator.id),
  );

  const observations = (
    <div className="flex flex-col gap-6">
      <section className="flex min-w-0 flex-col gap-2">
        <EvaluationRuleFieldLabel tooltip="Only matching observations are evaluated. Add filters to narrow the incoming data included.">
          Filters
        </EvaluationRuleFieldLabel>
        <RuleFilterSearchBar
          projectId={projectId}
          filterState={filterState}
          setFilterState={onFilterStateChange}
        />
        <div className="flex flex-wrap items-center gap-2">
          {EXAMPLE_FILTERS.map((example) => (
            <Button
              key={example.label}
              type="button"
              variant="outline"
              onClick={() =>
                onFilterStateChange(
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
          timeRange={timeRange}
          columnVisibilityStorageKeySuffix={columnVisibilityStorageKeySuffix}
          onSelectObservation={(row) => {
            if (row.traceId) onOpenTrace(row.traceId);
          }}
        />

        <EvaluationRuleSamplingField
          sampling={sampling}
          onSamplingChange={onSamplingChange}
        />
      </section>
    </div>
  );

  const evaluatorSelection = (
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
              disabled={validating}
            >
              Attach evaluator
              <Link2 className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <Command>
              <CommandInput placeholder="Find an evaluator..." />
              <CommandList>
                <CommandEmpty>No unattached evaluator found.</CommandEmpty>
                <CommandGroup heading="Available evaluators">
                  {unattachedEvaluators.map((evaluator) => (
                    <CommandItem
                      key={evaluator.id}
                      value={`${evaluator.scoreName} ${evaluator.id}`}
                      onSelect={() => {
                        setEvaluatorPickerOpen(false);
                        Promise.resolve(onToggleEvaluator(evaluator.id)).catch(
                          () => undefined,
                        );
                      }}
                    >
                      <span className="truncate" title={evaluator.scoreName}>
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
      {evaluators.length > 0 ? (
        <ul
          className="divide-border divide-y overflow-hidden rounded-md border"
          aria-label="Selected evaluators"
        >
          {evaluators.map((evaluator) => (
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
                disabled={validating}
                onClick={() =>
                  Promise.resolve(onToggleEvaluator(evaluator.id)).catch(
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
      {validationRequired && onValidateEvaluators ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          loading={validating}
          onClick={() =>
            Promise.resolve(onValidateEvaluators()).catch(() => undefined)
          }
        >
          Validate selected evaluators
        </Button>
      ) : null}
      {validationContent}
    </div>
  );

  const ruleName = (
    <div className="flex flex-col gap-2">
      <EvaluationRuleFieldLabel
        htmlFor={`${idPrefix}-name`}
        tooltip="Use a short, recognizable name for this rule."
      >
        Name
      </EvaluationRuleFieldLabel>
      <Input
        id={`${idPrefix}-name`}
        value={name}
        placeholder="e.g. Production observations"
        onChange={(event) => onNameChange(event.target.value)}
      />
      <p className="text-muted-foreground text-xs">{nameHint}</p>
    </div>
  );

  return (
    <EvaluationRuleConfigurationSteps
      observations={observations}
      evaluators={evaluatorSelection}
      name={ruleName}
      nameOpen={nameOpen}
      defaultNameOpen={defaultNameOpen}
      onNameOpenChange={onNameOpenChange}
    />
  );
}
