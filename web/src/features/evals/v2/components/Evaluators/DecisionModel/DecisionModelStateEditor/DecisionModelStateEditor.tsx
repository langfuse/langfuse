import { DecisionModelStateKeySchema } from "@langfuse/shared";
import { TextActionButton } from "@/src/components/design-system/TextActionButton/TextActionButton";
import { DecisionModelStatePreview } from "@/src/features/evals/v2/components/Evaluators/DecisionModel/DecisionModelStatePreview/DecisionModelStatePreview";
import { EditableVariableMapping } from "@/src/features/evals/v2/components/VariableMapping/components/EditableVariableMapping/EditableVariableMapping";
import type {
  ActiveVariableMapping,
  VariableFieldState,
} from "@/src/features/evals/v2/types/variableMapping";

export type DecisionModelStateField = {
  key: string;
  fieldState: VariableFieldState;
};

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

      <TextActionButton text="Add field" onClick={onAddField} />

      <DecisionModelStatePreview fields={fields} sourceObject={sourceObject} />
    </div>
  );
}
