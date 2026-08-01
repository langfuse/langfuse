import { useState, type ReactNode } from "react";
import { Link2 } from "lucide-react";
import {
  type FilterState,
  type ObservationVariableMapping,
} from "@langfuse/shared";

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
import {
  EvaluationRuleEvaluatorList,
  type EvaluationRuleFormEvaluator,
} from "@/src/features/evals/v2/components/EvaluationRuleEvaluatorList";
import { EvaluationRulePreviewTable } from "@/src/features/evals/v2/components/EvaluationRulePreviewTable";
import {
  EXAMPLE_FILTERS,
  mergeExampleFilters,
  RuleFilterSearchBar,
} from "@/src/features/evals/v2/components/EvaluationRuleSection";
import { SetupStep } from "@/src/features/evals/v2/components/production/SetupStep";
import { type AbsoluteTimeRange } from "@/src/utils/date-range-utils";

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
  onEvaluatorMappingChange,
  timeRange,
  onOpenTrace,
  evaluatorContent,
  initialExpandedEvaluatorId,
  nameOpen,
  onNameOpenChange,
  defaultSamplingOpen = false,
  defaultEvaluatorOpen = true,
  defaultNameOpen = false,
  nameHint,
  idPrefix,
  readOnly = false,
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
  onEvaluatorMappingChange: (
    evaluatorId: string,
    mapping: ObservationVariableMapping[],
  ) => void;
  timeRange: AbsoluteTimeRange | null;
  onOpenTrace: (traceId: string) => void;
  evaluatorContent?: ReactNode;
  initialExpandedEvaluatorId?: string;
  nameOpen?: boolean;
  onNameOpenChange?: (open: boolean) => void;
  defaultSamplingOpen?: boolean;
  defaultEvaluatorOpen?: boolean;
  defaultNameOpen?: boolean;
  nameHint: ReactNode;
  idPrefix: string;
  readOnly?: boolean;
}) {
  const [observationsOpen, setObservationsOpen] = useState(true);
  const [samplingOpen, setSamplingOpen] = useState(defaultSamplingOpen);
  const [evaluatorOpen, setEvaluatorOpen] = useState(defaultEvaluatorOpen);
  const [internalNameOpen, setInternalNameOpen] = useState(defaultNameOpen);
  const [evaluatorPickerOpen, setEvaluatorPickerOpen] = useState(false);
  const selectedEvaluatorIds = new Set(
    evaluators.map((evaluator) => evaluator.id),
  );
  const unattachedEvaluators = availableEvaluators.filter(
    (evaluator) => !selectedEvaluatorIds.has(evaluator.id),
  );
  const resolvedNameOpen = nameOpen ?? internalNameOpen;
  const setNameOpen = (open: boolean) => {
    if (onNameOpenChange) {
      onNameOpenChange(open);
      return;
    }
    setInternalNameOpen(open);
  };

  return (
    <div className="flex flex-col gap-3">
      <SetupStep
        number={1}
        title="Choose observations"
        description="Filter incoming observations and preview what this rule will evaluate."
        open={observationsOpen}
        onOpenChange={setObservationsOpen}
      >
        <div className="flex flex-col gap-6">
          <section className="flex min-w-0 flex-col gap-2">
            <EvaluationRuleFieldLabel tooltip="Only matching observations are evaluated. Add filters to narrow the incoming data included.">
              Filters
            </EvaluationRuleFieldLabel>
            <div
              inert={readOnly ? true : undefined}
              aria-disabled={readOnly || undefined}
              className={readOnly ? "opacity-60" : undefined}
            >
              <RuleFilterSearchBar
                projectId={projectId}
                filterState={filterState}
                setFilterState={onFilterStateChange}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {EXAMPLE_FILTERS.map((example) => (
                <Button
                  key={example.label}
                  type="button"
                  variant="outline"
                  disabled={readOnly}
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
              onSelectObservation={(row) => {
                if (row.traceId) onOpenTrace(row.traceId);
              }}
            />
          </section>
        </div>
      </SetupStep>

      <SetupStep
        number={2}
        title="Set sampling rate"
        description="Choose the share of matching observations to evaluate."
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
            disabled={readOnly}
            onValueChange={(value) => onSamplingChange(value[0] ?? sampling)}
            showInput
            displayAsPercentage
          />
        </div>
      </SetupStep>

      <SetupStep
        number={3}
        title="Attach evaluator"
        description="Choose which evaluators should run on matching observations."
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
                  disabled={readOnly}
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
                            Promise.resolve(
                              onToggleEvaluator(evaluator.id),
                            ).catch(() => undefined);
                          }}
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
          <EvaluationRuleEvaluatorList
            projectId={projectId}
            filterState={filterState}
            timeRange={timeRange}
            evaluators={evaluators}
            readOnly={readOnly}
            initialExpandedEvaluatorId={initialExpandedEvaluatorId}
            onMappingChange={onEvaluatorMappingChange}
            onRemove={onToggleEvaluator}
          />
          {evaluatorContent}
        </div>
      </SetupStep>

      <SetupStep
        number={4}
        title="Name rule"
        description="Give this rule a clear name so it is easy to recognize."
        open={resolvedNameOpen}
        isLast
        onOpenChange={setNameOpen}
      >
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
            disabled={readOnly}
            placeholder="e.g. Production observations"
            onChange={(event) => onNameChange(event.target.value)}
          />
          <p className="text-muted-foreground text-xs">{nameHint}</p>
        </div>
      </SetupStep>
    </div>
  );
}
