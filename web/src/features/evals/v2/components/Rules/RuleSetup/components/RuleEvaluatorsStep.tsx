import { useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { Check, Link2, Plus } from "lucide-react";
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
import { Stepper } from "@/src/features/evals/v2/components/Stepper/Stepper";
import { EvaluatorTypeBadge } from "@/src/features/evals/v2/components/Evaluators/EvaluatorTypeBadge/EvaluatorTypeBadge";
import { buildSelectedSampleObject } from "@/src/features/evals/v2/fns/evaluatorTesting/buildSelectedSampleObject";
import type {
  RuleEvaluatorOption,
  RuleSetupStore,
} from "@/src/features/evals/v2/types/rules";

import { EvaluatorMappingRow } from "./EvaluatorMappingRow";
import { api, sendAsPostOption } from "@/src/utils/api";

function EvaluatorPickerOption({
  evaluator,
}: {
  evaluator: RuleEvaluatorOption;
}) {
  const creator =
    evaluator.createdByUser?.name ??
    evaluator.createdByUser?.email ??
    "Unknown";
  const updated = evaluator.updatedAt
    ? formatDistanceToNowStrict(evaluator.updatedAt, { addSuffix: true })
    : null;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="min-w-0 truncate" title={evaluator.name}>
          {evaluator.name}
        </span>
        <EvaluatorTypeBadge type={evaluator.type} />
      </div>
      <div className="text-muted-foreground flex max-w-[45%] min-w-0 shrink-0 items-center justify-end gap-1 text-xs">
        <span className="min-w-0 truncate" title={`Created by ${creator}`}>
          {creator}
        </span>
        {updated ? (
          <>
            <span aria-hidden>·</span>
            <span className="shrink-0" title={`Updated ${updated}`}>
              {updated}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function RuleEvaluatorsStep({
  projectId,
  evaluatorOptions,
  store,
  search,
  onSearchChange,
}: {
  projectId: string;
  evaluatorOptions: RuleEvaluatorOption[];
  store: RuleSetupStore;
  search: string;
  onSearchChange: (search: string) => void;
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
  const selectedObservation = useStore(
    store,
    (state) => state.selectedObservation,
  );
  const selectedObservationDetails = api.events.experimentBatchIO.useQuery(
    {
      projectId,
      observations: [
        {
          id: selectedObservation?.id ?? "",
          traceId: selectedObservation?.traceId ?? "",
        },
      ],
      minStartTime: selectedObservation?.startTime ?? new Date(0),
      maxStartTime: selectedObservation?.startTime ?? new Date(0),
      truncated: false,
      includeToolCalls: true,
    },
    {
      ...sendAsPostOption,
      enabled: Boolean(
        selectedObservation?.id &&
        selectedObservation.traceId &&
        selectedObservation.startTime,
      ),
      select: (data) => data[0],
    },
  );
  const sampleObject = buildSelectedSampleObject({
    observation: selectedObservation,
    eventDetails: selectedObservationDetails.data,
  });
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
            className="border-border hover:bg-muted/50 focus-visible:ring-ring flex w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 py-6 text-center transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <span className="flex items-center gap-2 text-sm font-bold">
              <Link2 className="h-4 w-4" />
              Attach evaluator
            </span>
            <span className="text-muted-foreground text-sm font-normal">
              Attach an evaluator to run on matching observations.
            </span>
          </button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-foreground hover:text-foreground h-auto px-0 py-0 text-xs underline-offset-4 hover:bg-transparent hover:underline"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Attach another evaluator
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="h-80 w-[32rem] max-w-[calc(100vw-2rem)] p-0"
      >
        {/* Filtering is server-side so evaluators beyond the first page stay
            reachable. */}
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
    <Stepper
      number={2}
      title="Attach evaluators"
      description="Choose which evaluators should run on matching observations."
    >
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

                return (
                  <EvaluatorMappingRow
                    key={evaluatorId}
                    evaluatorId={evaluatorId}
                    evaluatorName={
                      assignment?.evaluatorName ??
                      evaluator?.name ??
                      "Evaluator"
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
                  />
                );
              })}
            </ul>
            {evaluatorPicker}
          </>
        )}
      </div>
    </Stepper>
  );
}
