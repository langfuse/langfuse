import { DecisionModelStatePreview } from "@/src/evaluators/v2/components/Evaluators/DecisionModel/DecisionModelStatePreview/DecisionModelStatePreview";
import type { DecisionModelStateField } from "@/src/evaluators/v2/components/Evaluators/DecisionModel/DecisionModelStateEditor/DecisionModelStateEditor";
import { previewOpenAIDecisionQuestions } from "@/src/evaluators/v2/fns/evaluators/decisionModelQuestions";
import { EditableVariableMapping } from "@/src/evaluators/v2/components/VariableMapping/components/EditableVariableMapping/EditableVariableMapping";
import type { DecisionModelQuestionDraft } from "@/src/evaluators/v2/types/decisionModel";
import type {
  ActiveVariableMapping,
  VariableFieldState,
} from "@/src/evaluators/v2/types/variableMapping";

/**
 * OpenAI decisions take one `input` plus the questions. The question text does
 * not name fields, so this mapping cannot be renamed or extended. The preview
 * is that input beside the questions posted with it.
 */
export function OpenAIDecisionModelStateEditor({
  field,
  questions,
  activeMapping,
  onActiveMappingChange,
  onChangeField,
  sourceObject,
  hasMatchingObservations,
  sourceUnavailableMessage,
}: {
  field: DecisionModelStateField;
  questions: DecisionModelQuestionDraft[];
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
      <DecisionModelStatePreview
        fields={[field]}
        sourceObject={sourceObject}
        questions={previewOpenAIDecisionQuestions(questions)}
        title="Sent to the model"
      />
    </div>
  );
}
