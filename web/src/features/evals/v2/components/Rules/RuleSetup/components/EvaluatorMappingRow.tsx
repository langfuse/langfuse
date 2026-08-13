import { Check, ChevronDown, TriangleAlert, Unlink } from "lucide-react";
import { type ObservationVariableMapping } from "@langfuse/shared";
import { useState } from "react";
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

export function EvaluatorMappingRow({
  evaluatorId,
  evaluatorName,
  defaultVariableMapping,
  store,
  sampleObject,
}: {
  evaluatorId: string;
  evaluatorName: string;
  defaultVariableMapping: ObservationVariableMapping[];
  store: RuleSetupStore;
  sampleObject: Record<string, unknown> | null;
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
        <div className="flex min-h-11 items-center justify-between gap-3 px-3">
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
              </span>
            </Button>
          </CollapsibleTrigger>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => detachEvaluator(evaluatorId)}
          >
            <Unlink className="h-3.5 w-3.5" />
            Disconnect
          </Button>
        </div>
        <CollapsibleContent className="border-t p-3">
          {mapping.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              This evaluator has no variables.
            </p>
          ) : (
            <VariableMapping
              mode="editable"
              mappings={mappings}
              {...variableMapping.mappingProps}
              onChangeField={updateMapping}
              sourceObject={sampleObject}
              hasMatchingObservations={Boolean(sampleObject)}
              sourceUnavailableMessage="No matching observation is available to validate JSON paths."
            />
          )}
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}
