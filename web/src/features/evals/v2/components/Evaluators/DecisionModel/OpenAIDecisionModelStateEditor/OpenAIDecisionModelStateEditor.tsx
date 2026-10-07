import { EditableVariableMapping } from "@/src/features/evals/v2/components/VariableMapping/components/EditableVariableMapping/EditableVariableMapping";
import { DecisionModelStatePreview } from "@/src/features/evals/v2/components/Evaluators/DecisionModel/DecisionModelStatePreview/DecisionModelStatePreview";
import type { DecisionModelStateField } from "@/src/features/evals/v2/components/Evaluators/DecisionModel/DecisionModelStateEditor/DecisionModelStateEditor";
import type {
  ActiveVariableMapping,
  VariableFieldState,
} from "@/src/features/evals/v2/types/variableMapping";

/**
 * OpenAI decisions take one `input`. The question text does not name fields,
 * so this mapping cannot be renamed or extended. The preview is the object
 * sent as that input.
 */
export function OpenAIDecisionModelStateEditor({
  field,
  activeMapping,
  onActiveMappingChange,
  onChangeField,
  sourceObject,
  hasMatchingObservations,
  sourceUnavailableMessage,
}: {
  field: DecisionModelStateField;
  activeMapping: ActiveVariableMapping;
  onActiveMappingChange: (activeMapping: ActiveVariableMapping) => void;
  onChangeField: (fieldState: VariableFieldState) => void;
  sourceObject: Record<string, unknown> | null;
  hasMatchingObservations: boolean;
  sourceUnavailableMessage?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <EditableVariableMapping
        mappings={[{ variable: "input", fieldState: field.fieldState }]}
        variableDisplay="stateKey"
        activeMapping={activeMapping}
        onActiveMappingChange={onActiveMappingChange}
        onChangeField={(_key, fieldState) => onChangeField(fieldState)}
        sourceObject={sourceObject}
        hasMatchingObservations={hasMatchingObservations}
        sourceUnavailableMessage={sourceUnavailableMessage}
      />
      <DecisionModelStatePreview fields={[field]} sourceObject={sourceObject} />
    </div>
  );
}
