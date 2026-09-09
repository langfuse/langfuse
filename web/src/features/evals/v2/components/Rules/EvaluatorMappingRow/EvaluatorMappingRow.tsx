import { Check, ChevronDown, TriangleAlert, Unlink } from "lucide-react";
import type {
  EvalTemplateType,
  ObservationVariableMapping,
} from "@langfuse/shared";
import { memo, type ReactNode, useState } from "react";
import { useStore } from "zustand";

import { Button } from "@/src/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { VariableMapping } from "@/src/features/evals/v2/components/VariableMapping/VariableMapping";
import { extractVariableMappingValue } from "@/src/features/evals/v2/fns/variableMapping/extractVariableMappingValue";
import { useVariableMappingController } from "@/src/features/evals/v2/hooks/useVariableMappingController";
import type { VariableFieldState } from "@/src/features/evals/v2/types/variableMapping";
import type { RuleSetupStore } from "@/src/features/evals/v2/types/rules";

export const EvaluatorMappingRow = memo(function EvaluatorMappingRow({
  evaluatorId,
  evaluatorName,
  evaluatorType,
  defaultVariableMapping,
  store,
  sampleObject,
  unvalidatedSourceColumnIds = [],
  sourceUnavailableMessage = "No matching observation is available to validate JSON paths.",
  disabled = false,
  costEstimate,
}: {
  evaluatorId: string;
  evaluatorName: string;
  evaluatorType: EvalTemplateType;
  defaultVariableMapping: ObservationVariableMapping[];
  store: RuleSetupStore;
  sampleObject: Record<string, unknown> | null;
  unvalidatedSourceColumnIds?: string[];
  sourceUnavailableMessage?: string;
  disabled?: boolean;
  costEstimate: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const variableMappingOverride = useStore(
    store,
    (state) =>
      state.assignments.find(
        (assignment) => assignment.evaluatorId === evaluatorId,
      )?.variableMapping,
  );
  const setVariableMapping = useStore(
    store,
    (state) => state.actions.setVariableMapping,
  );
  const detachEvaluator = useStore(
    store,
    (state) => state.actions.detachEvaluator,
  );
  const variableMapping = useVariableMappingController();
  const isCodeEvaluator = evaluatorType === "CODE";
  const mapping = variableMappingOverride ?? defaultVariableMapping;
  const mappings = mapping.map((entry) => ({
    variable: entry.templateVariable,
    fieldState: {
      selectedColumnId: entry.selectedColumnId || null,
      jsonSelector: entry.jsonSelector ?? null,
    },
  }));
  const mappedVariableCount = mapping.filter((entry) => {
    if (!entry.selectedColumnId) return false;
    if (unvalidatedSourceColumnIds.includes(entry.selectedColumnId))
      return true;
    if (!sampleObject) return true;

    const extracted = extractVariableMappingValue(
      sampleObject,
      entry.selectedColumnId,
      entry.jsonSelector ?? undefined,
    );
    return !extracted.error && Boolean(extracted.value);
  }).length;
  const allVariablesMapped =
    mapping.length > 0 && mappedVariableCount === mapping.length;
  const hasInvalidMappings =
    mapping.length > 0 && mappedVariableCount < mapping.length;
  const updateMapping = (
    templateVariable: string,
    fieldState: VariableFieldState,
  ) =>
    setVariableMapping(
      evaluatorId,
      mapping.map((entry) =>
        entry.templateVariable === templateVariable
          ? {
              ...entry,
              selectedColumnId: fieldState.selectedColumnId ?? "",
              jsonSelector: fieldState.jsonSelector,
            }
          : entry,
      ),
    );

  return (
    <li className="border-b last:border-b-0" {...variableMapping.boundaryProps}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex h-8 items-stretch">
          <div className="hover:bg-muted/50 flex min-w-0 flex-1 items-center gap-3 px-3 transition-colors">
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="min-w-0 flex-1 justify-start gap-2 px-0 hover:bg-transparent"
              >
                <ChevronDown
                  className={`text-muted-foreground h-4 w-4 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
                />
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate" title={evaluatorName}>
                    {evaluatorName}
                  </span>
                  {!isCodeEvaluator ? (
                    <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs">
                      {mappedVariableCount}/{mapping.length} variables mapped
                      {allVariablesMapped ? (
                        <Check
                          aria-label="All variables mapped"
                          className="text-dark-green h-3.5 w-3.5"
                        />
                      ) : hasInvalidMappings ? (
                        <span
                          aria-label="Some variables are not mapped correctly"
                          title="Some variables are not mapped correctly"
                          className="text-dark-yellow h-3.5 w-3.5"
                        >
                          <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </span>
              </Button>
            </CollapsibleTrigger>
            {costEstimate}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="hover:bg-muted/50 h-8 gap-2 rounded-none border-l px-3"
            disabled={disabled}
            onClick={() => detachEvaluator(evaluatorId)}
          >
            <Unlink className="h-3.5 w-3.5" />
            Disconnect
          </Button>
        </div>
        <CollapsibleContent className="border-t p-3">
          {isCodeEvaluator ? (
            <p className="text-muted-foreground text-sm">
              Observation data is available directly in code evaluators, so no
              variable mapping is required.
            </p>
          ) : mapping.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No variable mapping is required because this evaluator does not
              define prompt variables.
            </p>
          ) : (
            <VariableMapping
              mode={disabled ? "read-only" : "editable"}
              mappings={mappings}
              {...variableMapping.mappingProps}
              onChangeField={updateMapping}
              sourceObject={sampleObject}
              hasMatchingObservations={Boolean(sampleObject)}
              unvalidatedSourceColumnIds={unvalidatedSourceColumnIds}
              sourceUnavailableMessage={sourceUnavailableMessage}
            />
          )}
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
});
