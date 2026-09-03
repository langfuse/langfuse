import { Check, Link2, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { EvaluatorMappingRow } from "@/src/features/evals/v2/components/Rules/EvaluatorMappingRow/EvaluatorMappingRow";
import type {
  RuleEvaluatorOption,
  RuleSetupStore,
} from "@/src/features/evals/v2/types/rules";

import { EvaluatorPickerOption } from "@/src/features/evals/v2/components/Rules/EvaluatorAssignmentsEditor/components/EvaluatorPickerOption/EvaluatorPickerOption";
import type { RuleCostEstimate } from "@/src/features/evals/v2/hooks/useRuleCostEstimate";
import { RuleEvaluatorCostEstimate } from "@/src/features/evals/v2/components/Rules/RuleSetup/components/RuleEvaluatorCostEstimate";
import { Skeleton } from "@/src/components/ui/skeleton";

export function EvaluatorAssignmentsEditor({
  evaluatorOptions,
  store,
  search,
  onSearchChange,
  sampleObject,
  unvalidatedSourceColumnIds,
  emptyDescription = "Attach an evaluator to run on matching observations.",
  sourceUnavailableMessage,
  disabled = false,
  costEstimates,
  estimatingEvaluatorIds,
  footerTrailing,
}: {
  evaluatorOptions: RuleEvaluatorOption[];
  store: RuleSetupStore;
  search: string;
  onSearchChange: (search: string) => void;
  sampleObject: Record<string, unknown> | null;
  unvalidatedSourceColumnIds?: string[];
  emptyDescription?: string;
  sourceUnavailableMessage?: string;
  disabled?: boolean;
  costEstimates: RuleCostEstimate[];
  estimatingEvaluatorIds: string[];
  footerTrailing: ReactNode;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const assignments = useStore(store, (state) => state.assignments);
  const attachedIds = useStore(
    store,
    useShallow((state) =>
      state.assignments.map((assignment) => assignment.evaluatorId),
    ),
  );
  const attachEvaluator = useStore(
    store,
    (state) => state.actions.attachEvaluator,
  );
  const attachedIdSet = new Set(attachedIds);
  const attached = evaluatorOptions.filter((evaluator) =>
    attachedIdSet.has(evaluator.id),
  );
  const available = evaluatorOptions.filter(
    (evaluator) => !attachedIdSet.has(evaluator.id),
  );
  const evaluatorPicker = (
    <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
      <PopoverTrigger asChild>
        {attachedIds.length === 0 ? (
          <button
            type="button"
            disabled={disabled}
            className="border-border hover:bg-muted/50 focus-visible:ring-ring flex w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 py-6 text-center transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex items-center gap-2 text-sm font-bold">
              <Link2 className="h-4 w-4" />
              Attach evaluator
            </span>
            <span className="text-muted-foreground text-sm font-normal">
              {emptyDescription}
            </span>
          </button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            className="text-foreground hover:text-foreground inline-flex h-auto items-center gap-1.5 px-0 py-0 text-xs leading-none underline-offset-4 hover:bg-transparent hover:underline"
          >
            <Plus className="size-3.5 shrink-0" aria-hidden="true" />
            Attach another evaluator
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="h-80 w-[32rem] max-w-[calc(100vw-2rem)] p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Find an evaluator..."
            value={search}
            onValueChange={onSearchChange}
          />
          <CommandList className="min-h-0 flex-1">
            <CommandEmpty>No evaluator found.</CommandEmpty>
            {attached.length > 0 ? (
              <CommandGroup heading="Already attached">
                {attached.map((evaluator) => (
                  <CommandItem
                    key={evaluator.id}
                    value={`${evaluator.name} ${evaluator.id} already attached`}
                    disabled
                    className="py-2.5"
                  >
                    <Check className="h-4 w-4 shrink-0" />
                    <EvaluatorPickerOption evaluator={evaluator} />
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {available.length > 0 ? (
              <CommandGroup heading="Available evaluators">
                {available.map((evaluator) => (
                  <CommandItem
                    key={evaluator.id}
                    value={`${evaluator.name} ${evaluator.id}`}
                    className="py-2.5"
                    onSelect={() => {
                      attachEvaluator({
                        evaluatorId: evaluator.id,
                        evaluatorName: evaluator.name,
                        evaluatorType: evaluator.type,
                        defaultVariableMapping:
                          evaluator.defaultVariableMapping,
                        variableMapping: evaluator.initialVariableMapping,
                        requiredVariables: evaluator.requiredVariables,
                      });
                      setPickerOpen(false);
                    }}
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <EvaluatorPickerOption evaluator={evaluator} />
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="space-y-3">
      {attachedIds.length === 0 ? (
        evaluatorPicker
      ) : (
        <>
          <ul className="overflow-hidden rounded-md border">
            {attachedIds.map((evaluatorId) => {
              const evaluator = evaluatorOptions.find(
                (option) => option.id === evaluatorId,
              );
              const assignment = assignments.find(
                (candidate) => candidate.evaluatorId === evaluatorId,
              );
              const costEstimate = costEstimates.find(
                (estimate) => estimate.evaluatorId === evaluatorId,
              );

              return (
                <EvaluatorMappingRow
                  key={evaluatorId}
                  evaluatorId={evaluatorId}
                  evaluatorName={
                    assignment?.evaluatorName ?? evaluator?.name ?? "Evaluator"
                  }
                  evaluatorType={
                    assignment?.evaluatorType ??
                    evaluator?.type ??
                    "LLM_AS_JUDGE"
                  }
                  defaultVariableMapping={
                    assignment?.defaultVariableMapping ??
                    evaluator?.defaultVariableMapping ??
                    []
                  }
                  store={store}
                  sampleObject={sampleObject}
                  unvalidatedSourceColumnIds={unvalidatedSourceColumnIds}
                  sourceUnavailableMessage={sourceUnavailableMessage}
                  disabled={disabled}
                  costEstimate={
                    estimatingEvaluatorIds.includes(evaluatorId) ? (
                      <Skeleton className="h-4 w-28" />
                    ) : costEstimate ? (
                      <RuleEvaluatorCostEstimate estimate={costEstimate} />
                    ) : null
                  }
                />
              );
            })}
          </ul>
          <div className="flex items-start justify-between gap-3">
            {evaluatorPicker}
            {footerTrailing}
          </div>
        </>
      )}
    </div>
  );
}
