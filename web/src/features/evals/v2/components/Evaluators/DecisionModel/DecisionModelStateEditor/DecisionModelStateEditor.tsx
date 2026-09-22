import { useMemo, useState, type ReactNode } from "react";
import {
  DecisionModelStateKeySchema,
  deepParseJsonIterative,
  jsonSchema,
} from "@langfuse/shared";
import { ChevronDown, Plus, TriangleAlert } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { Textarea } from "@/src/components/ui/textarea";
import { EditableVariableMapping } from "@/src/features/evals/v2/components/VariableMapping/components/EditableVariableMapping/EditableVariableMapping";
import { VariableMappingCardShell } from "@/src/features/evals/v2/components/VariableMapping/components/VariableMappingCardShell";
import { extractVariableMappingValue } from "@/src/features/evals/v2/fns/variableMapping/extractVariableMappingValue";
import { inferDefaultMapping } from "@/src/features/evals/utils/evaluator-form-utils";
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
  const state: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.fieldState.valueSource === "constant") {
      const parsed = parseConstantValue(field.fieldState.constantValue);
      if (parsed.success) state[field.key] = parsed.value;
      continue;
    }
    if (!sourceObject) continue;
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
  return sourceObject ||
    fields.some((field) => field.fieldState.valueSource === "constant")
    ? state
    : null;
}

function parseConstantValue(value: string | undefined) {
  try {
    return {
      success: true as const,
      value: jsonSchema.parse(JSON.parse(value ?? "")),
    };
  } catch {
    return { success: false as const };
  }
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

function ConstantStateFieldCard({
  field,
  activeMapping,
  onActiveMappingChange,
  onChangeField,
  onRenameField,
  onRemoveField,
  validateName,
}: {
  field: DecisionModelStateField;
  activeMapping: ActiveVariableMapping;
  onActiveMappingChange: (activeMapping: ActiveVariableMapping) => void;
  onChangeField: (key: string, fieldState: VariableFieldState) => void;
  onRenameField: (key: string, next: string) => void;
  onRemoveField?: (key: string) => void;
  validateName: (next: string) => string | null;
}) {
  const parsed = parseConstantValue(field.fieldState.constantValue);
  const active = activeMapping?.variable === field.key;
  const editing = active && activeMapping.state === "editing";
  const expanded = active && activeMapping.state === "preview";
  let body: ReactNode = null;
  if (editing) {
    body = (
      <div className="flex flex-col gap-1.5 p-3">
        <Textarea
          value={field.fieldState.constantValue ?? ""}
          className="min-h-24 font-mono"
          aria-label={`Constant JSON value for ${field.key}`}
          placeholder='"production" or {"policy":"strict"}'
          onChange={(event) =>
            onChangeField(field.key, {
              selectedColumnId: null,
              jsonSelector: null,
              valueSource: "constant",
              constantValue: event.target.value,
            })
          }
        />
        <p
          className={cn(
            "text-muted-foreground text-xs",
            !parsed.success && "text-destructive",
          )}
        >
          {parsed.success
            ? "This JSON value is sent unchanged on every evaluation."
            : "Enter valid JSON. Strings need double quotes; null is not supported."}
        </p>
      </div>
    );
  } else if (expanded && parsed.success) {
    body = (
      <PrettyJsonView
        json={parsed.value}
        currentView="pretty"
        isLoading={false}
        showNullValues={true}
        stickyTopLevelKey={false}
        showObservationTypeBadge={false}
        scrollable={true}
        className="max-h-80 [&_.border]:border-0 [&_.rounded-sm]:rounded-none"
      />
    );
  }

  return (
    <VariableMappingCardShell
      variable={field.key}
      variableDisplay="stateKey"
      mapping={<span className="font-mono text-xs">constant</span>}
      isUnmapped={!parsed.success}
      warningMessage={
        parsed.success ? null : "Enter a valid non-null JSON value."
      }
      isExpanded={expanded}
      isEditing={editing}
      onExpandedChange={(open) =>
        onActiveMappingChange(
          open ? { variable: field.key, state: "preview" } : null,
        )
      }
      onEditingChange={(isEditing) =>
        onActiveMappingChange({
          variable: field.key,
          state: isEditing ? "editing" : "preview",
        })
      }
      onDelete={onRemoveField ? () => onRemoveField(field.key) : undefined}
      rename={{
        isRenaming: active && activeMapping.state === "renaming",
        onRenamingChange: (renaming) =>
          onActiveMappingChange(
            renaming ? { variable: field.key, state: "renaming" } : null,
          ),
        onRename: (next) => onRenameField(field.key, next),
        validateName,
      }}
    >
      {body}
    </VariableMappingCardShell>
  );
}

/**
 * The state a decision model sees: a JSON object whose keys the user names and
 * whose values are extracted from the observation or supplied as constants.
 * Observation sources reuse the LLM-judge mapping cards; constants use the
 * same shell with a JSON editor.
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
      {fields.map((field) => {
        const isConstant = field.fieldState.valueSource === "constant";
        return (
          <div key={field.key} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground mr-1 text-xs">
                Value source
              </span>
              <Button
                type="button"
                variant={isConstant ? "ghost" : "secondary"}
                size="xs"
                onClick={() => {
                  const inferred = inferDefaultMapping(field.key);
                  onChangeField(field.key, {
                    selectedColumnId: inferred.selectedColumnId ?? null,
                    jsonSelector: null,
                    valueSource: "observation",
                  });
                }}
              >
                Observation
              </Button>
              <Button
                type="button"
                variant={isConstant ? "secondary" : "ghost"}
                size="xs"
                onClick={() => {
                  onChangeField(field.key, {
                    selectedColumnId: null,
                    jsonSelector: null,
                    valueSource: "constant",
                    constantValue: field.fieldState.constantValue ?? '""',
                  });
                  onActiveMappingChange({
                    variable: field.key,
                    state: "editing",
                  });
                }}
              >
                Constant
              </Button>
            </div>
            {isConstant ? (
              <ConstantStateFieldCard
                field={field}
                activeMapping={activeMapping}
                onActiveMappingChange={onActiveMappingChange}
                onChangeField={onChangeField}
                onRenameField={onRenameField}
                onRemoveField={fields.length > 1 ? onRemoveField : undefined}
                validateName={(next) => validateStateKey(next, fields)}
              />
            ) : (
              <EditableVariableMapping
                mappings={[
                  {
                    variable: field.key,
                    fieldState: field.fieldState,
                  },
                ]}
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
            )}
          </div>
        );
      })}

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
