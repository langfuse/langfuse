import { useMemo, useState } from "react";
import {
  DecisionModelStateKeySchema,
  deepParseJsonIterative,
} from "@langfuse/shared";
import { ChevronDown, Plus, TriangleAlert } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { EditableVariableMapping } from "@/src/features/evals/v2/components/VariableMapping/components/EditableVariableMapping/EditableVariableMapping";
import { extractVariableMappingValue } from "@/src/features/evals/v2/fns/variableMapping/extractVariableMappingValue";
import type {
  ActiveVariableMapping,
  VariableFieldState,
} from "@/src/features/evals/v2/types/variableMapping";
import { cn } from "@/src/utils/tailwind";

export type DecisionModelStateField = {
  key: string;
  fieldState: VariableFieldState;
};

/** TypeSafe accepts ~32k for state plus the longest question; warn well below. */
const STATE_SIZE_WARNING_CHARS = 24_000;

/**
 * Builds the JSON object the model receives from the mapped fields and the
 * sample observation, mirroring the worker's state builder.
 */
function buildStatePreview(
  fields: DecisionModelStateField[],
  sourceObject: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!sourceObject) return null;
  const state: Record<string, unknown> = {};
  for (const field of fields) {
    const columnId = field.fieldState.selectedColumnId;
    if (!columnId) continue;
    const { value } = extractVariableMappingValue(
      sourceObject,
      columnId,
      field.fieldState.jsonSelector ?? undefined,
    );
    if (value === null || value === undefined || value === "") continue;
    state[field.key] = deepParseJsonIterative(value) ?? value;
  }
  return state;
}

/** Mirrors the shared state-key rule plus uniqueness within this evaluator. */
function validateStateKey(
  next: string,
  fields: DecisionModelStateField[],
): string | null {
  if (!DecisionModelStateKeySchema.safeParse(next).success) {
    return "Use letters, digits, and underscores; start with a letter.";
  }
  if (fields.some((field) => field.key === next)) {
    return "A field with this name already exists.";
  }
  return null;
}

/**
 * The state a decision model sees: a JSON object whose keys the user names and
 * whose values are extracted from the observation. Reuses the LLM-judge
 * mapping cards (field picker, JSON tree, JSONPath, live value) and adds the
 * assembled object with a size indicator, since context rot is the model's
 * main failure mode.
 */
export function DecisionModelStateEditor({
  fields,
  activeMapping,
  onActiveMappingChange,
  onChangeField,
  onAddField,
  onRenameField,
  onRemoveField,
  sourceObject,
  hasMatchingObservations,
  sourceUnavailableMessage,
}: {
  fields: DecisionModelStateField[];
  activeMapping: ActiveVariableMapping;
  onActiveMappingChange: (activeMapping: ActiveVariableMapping) => void;
  onChangeField: (key: string, fieldState: VariableFieldState) => void;
  /** Appends a placeholder-named field that opens in rename mode. */
  onAddField: () => void;
  onRenameField: (key: string, next: string) => void;
  onRemoveField: (key: string) => void;
  sourceObject: Record<string, unknown> | null;
  hasMatchingObservations: boolean;
  sourceUnavailableMessage?: string;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const statePreview = useMemo(
    () => buildStatePreview(fields, sourceObject),
    [fields, sourceObject],
  );
  const stateSize = statePreview ? JSON.stringify(statePreview).length : 0;
  const tooLarge = stateSize > STATE_SIZE_WARNING_CHARS;

  return (
    <div className="flex flex-col gap-3">
      <EditableVariableMapping
        mappings={fields.map((field) => ({
          variable: field.key,
          fieldState: field.fieldState,
        }))}
        variableDisplay="stateKey"
        activeMapping={activeMapping}
        onActiveMappingChange={onActiveMappingChange}
        onChangeField={onChangeField}
        onDeleteVariable={fields.length > 1 ? onRemoveField : undefined}
        onRenameVariable={onRenameField}
        validateVariableName={(_variable, next) =>
          validateStateKey(next, fields)
        }
        sourceObject={sourceObject}
        hasMatchingObservations={hasMatchingObservations}
        sourceUnavailableMessage={sourceUnavailableMessage}
      />

      <div>
        <Button type="button" variant="outline" size="sm" onClick={onAddField}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add field
        </Button>
      </div>

      <div className="rounded-md border">
        <button
          type="button"
          className="hover:bg-muted/50 flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
          aria-expanded={previewOpen}
          onClick={() => setPreviewOpen((open) => !open)}
        >
          <span className="flex items-center gap-2">
            <span className="font-bold">State sent to the model</span>
            {statePreview ? (
              <span
                className={cn(
                  "text-muted-foreground font-mono text-xs",
                  tooLarge && "text-dark-yellow flex items-center gap-1",
                )}
              >
                {tooLarge ? <TriangleAlert className="h-3.5 w-3.5" /> : null}
                {Object.keys(statePreview).length} field
                {Object.keys(statePreview).length === 1 ? "" : "s"} ·{" "}
                {stateSize.toLocaleString()} chars
                {tooLarge ? " · trim fields, ~32k limit" : ""}
              </span>
            ) : (
              <span className="text-muted-foreground text-xs">
                select a sample observation to preview
              </span>
            )}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 transition-transform",
              previewOpen ? "rotate-180" : "rotate-0",
            )}
          />
        </button>
        {previewOpen && statePreview ? (
          <div className="border-t">
            <PrettyJsonView
              json={statePreview}
              currentView="pretty"
              isLoading={false}
              showNullValues={true}
              stickyTopLevelKey={false}
              showObservationTypeBadge={false}
              scrollable={true}
              className="max-h-80 [&_.border]:border-0 [&_.rounded-sm]:rounded-none"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
