import { Fragment } from "react";
import {
  type EvalTemplateSourceCodeLanguage,
  EvalTemplateTypeEnum,
  type DecisionModelVariableMapping,
  type EvalTemplateType,
  type ObservationVariableMapping,
  type EvaluatorPromptMessage,
  parseDecisionModelQuestions,
} from "@langfuse/shared";

import { Codeblock as CodeBlock } from "@/src/components/design-system/Codeblock/Codeblock";
import { Badge } from "@/src/components/ui/badge";
import { Label } from "@/src/components/ui/label";
import { MediaReferenceTag } from "@/src/components/ui/media/MediaReferenceTag";
import { splitStringByMediaReferences } from "@/src/components/ui/media/mediaUtils";
import { PopoverTrigger } from "@/src/components/ui/popover";
import { EvaluatorCodeLanguageSelector } from "@/src/features/evals/v2/components/Evaluators/Code/EvaluatorCodeLanguageSelector/EvaluatorCodeLanguageSelector";
import { EvaluationTypeConfiguration } from "@/src/features/evals/v2/components/Evaluators/EvaluationTypeConfiguration/EvaluationTypeConfiguration";
import {
  JudgeModelPicker,
  JudgeModelPickerTrigger,
} from "@/src/features/evals/v2/components/Evaluators/JudgeModelPicker/JudgeModelPicker";
import { PromptVariableEditor } from "@/src/features/evals/v2/components/Evaluators/Judges/PromptVariableEditor/PromptVariableEditor";
import { ScoreOutputConfiguration } from "@/src/features/evals/v2/components/Evaluators/Judges/ScoreOutputConfiguration/ScoreOutputConfiguration";
import { VariableMapping } from "@/src/features/evals/v2/components/VariableMapping/VariableMapping";
import { DecisionModelQuestionSummary } from "@/src/features/evals/v2/components/Evaluators/DecisionModel/DecisionModelQuestionSummary/DecisionModelQuestionSummary";
import { evalVariableColumnLabel } from "@/src/features/evals/v2/fns/variableMapping/evalVariableColumnLabel";
import { formatMappingLabel } from "@/src/features/evals/v2/fns/variableMapping/segmentsToJsonPath";
import { sourceCodeLanguageLabel } from "@/src/features/evals/v2/fns/evaluators/sourceCodeLanguageLabel";
import { toScoreOutputFormState } from "@/src/features/evals/v2/fns/scoreOutput/toScoreOutputFormState";
import type { JudgeModel } from "@/src/features/evals/v2/judgeModel";

export type EvaluatorDefinition =
  | {
      type: Extract<EvalTemplateType, "CODE">;
      sourceCode: string | null;
      sourceCodeLanguage: EvalTemplateSourceCodeLanguage | null;
    }
  | {
      type: Extract<EvalTemplateType, "LLM_AS_JUDGE">;
      promptMessages: EvaluatorPromptMessage[];
      selectedModel: JudgeModel | null;
      defaultModel: JudgeModel | null;
      outputDefinition: unknown;
      variableMappings:
        | { state: "hidden" }
        | { state: "visible"; mappings: ObservationVariableMapping[] };
    }
  | {
      type: Extract<EvalTemplateType, "DECISION_MODEL">;
      questions: unknown;
      selectedModel: JudgeModel | null;
      variableMapping: DecisionModelVariableMapping[];
    };

// A saved version is immutable, so every control below is the live editing
// control in its disabled state rather than a second read-only rendering.
const noop = () => undefined;

function CodeEvaluatorDefinitionView({
  definition,
}: {
  definition: Extract<EvaluatorDefinition, { type: "CODE" }>;
}) {
  const { sourceCode, sourceCodeLanguage } = definition;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <EvaluationTypeConfiguration
        mode={EvalTemplateTypeEnum.CODE}
        onModeChange={noop}
        disabled
      >
        {sourceCodeLanguage ? (
          <EvaluatorCodeLanguageSelector
            value={sourceCodeLanguage}
            onValueChange={noop}
            disabled
          />
        ) : (
          <Badge variant="outline">Language unavailable</Badge>
        )}
      </EvaluationTypeConfiguration>
      <section className="flex flex-col gap-2">
        <Label>Code</Label>
        {/* The execution row above already names the language. */}
        <CodeBlock
          language={
            sourceCodeLanguage
              ? sourceCodeLanguageLabel(sourceCodeLanguage).toLowerCase()
              : "text"
          }
          value={sourceCode ?? ""}
          showLanguage={false}
          variant="read-only"
        />
      </section>
    </div>
  );
}

function LlmEvaluatorDefinitionView({
  definition,
}: {
  definition: Extract<EvaluatorDefinition, { type: "LLM_AS_JUDGE" }>;
}) {
  const { variableMappings, promptMessages } = definition;
  const mappings =
    variableMappings.state === "visible" ? variableMappings.mappings : [];
  // The prompt's {{variable}} tokens name their binding on hover, the same way
  // they do while editing.
  const variableLabels = Object.fromEntries(
    mappings.map((mapping) => [
      mapping.templateVariable,
      formatMappingLabel(
        evalVariableColumnLabel(mapping.selectedColumnId) ?? "",
        mapping.jsonSelector ?? null,
      ),
    ]),
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <EvaluationTypeConfiguration
        mode={EvalTemplateTypeEnum.LLM_AS_JUDGE}
        onModeChange={noop}
        disabled
      >
        <JudgeModelPicker
          open={false}
          onOpenChange={noop}
          mode={definition.selectedModel ? "custom" : "default"}
          defaultModel={definition.defaultModel}
          providerGroups={[]}
          selectedModel={definition.selectedModel}
          onModeChange={noop}
          onSelectCustom={noop}
          onConfigureProviders={noop}
          onConfigureModel={noop}
          canSetProjectDefault={false}
          onSetProjectDefault={noop}
        >
          <PopoverTrigger asChild>
            <JudgeModelPickerTrigger
              mode={definition.selectedModel ? "custom" : "default"}
              defaultModel={definition.defaultModel}
              selectedModel={definition.selectedModel}
              disabled
            />
          </PopoverTrigger>
        </JudgeModelPicker>
      </EvaluationTypeConfiguration>
      <section className="flex min-w-0 flex-col gap-2">
        <Label>Prompt</Label>
        {promptMessages.map((message, index) => (
          <PromptVariableEditor
            key={index}
            value={message.content}
            onChange={noop}
            variableMappings={variableLabels}
            readOnly
            validateVariableMappings={false}
            toolbarStart={
              <span className="text-muted-foreground px-1.5 text-xs capitalize">
                {message.role}
              </span>
            }
            previewEnabled
            preview={{
              status: "ready",
              fragments: [{ type: "text", text: message.content }],
            }}
            previewSurface="muted"
            renderPreviewText={renderMediaAwareText}
          />
        ))}
      </section>
      {variableMappings.state === "visible" ? (
        <section className="flex flex-col gap-2">
          <Label>Prompt variables</Label>
          <VariableMapping
            mode="read-only"
            mappings={mappings.map((mapping) => ({
              variable: mapping.templateVariable,
              fieldState: {
                selectedColumnId: mapping.selectedColumnId,
                jsonSelector: mapping.jsonSelector ?? null,
              },
            }))}
          />
        </section>
      ) : null}
      <ScoreOutputConfiguration
        state={toScoreOutputFormState(definition.outputDefinition)}
        mode="read-only"
      />
    </div>
  );
}

function DecisionModelDefinitionView({
  definition,
}: {
  definition: Extract<EvaluatorDefinition, { type: "DECISION_MODEL" }>;
}) {
  const questions = parseDecisionModelQuestions(definition.questions);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <EvaluationTypeConfiguration
        mode={EvalTemplateTypeEnum.DECISION_MODEL}
        onModeChange={noop}
        disabled
        showDecisionModel
      >
        <Badge variant="outline" className="font-mono">
          {definition.selectedModel
            ? `${definition.selectedModel.provider}: ${definition.selectedModel.model}`
            : "No model"}
        </Badge>
      </EvaluationTypeConfiguration>
      <section className="flex min-w-0 flex-col gap-2">
        <Label>Questions</Label>
        {questions.success ? (
          questions.data.map((question, index) => (
            <DecisionModelQuestionSummary
              key={question.id}
              question={question}
              index={index}
            />
          ))
        ) : (
          <p className="text-destructive text-xs">{questions.error}</p>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <Label>State</Label>
        <VariableMapping
          mode="read-only"
          variableDisplay="stateKey"
          mappings={definition.variableMapping.map((mapping) => ({
            variable: mapping.templateVariable,
            fieldState:
              "constantValue" in mapping
                ? {
                    selectedColumnId: null,
                    jsonSelector: null,
                    valueSource: "constant",
                    constantValue: JSON.stringify(mapping.constantValue),
                  }
                : {
                    selectedColumnId: mapping.selectedColumnId,
                    jsonSelector: mapping.jsonSelector ?? null,
                  },
          }))}
        />
      </section>
    </div>
  );
}

function renderMediaAwareText(value: string) {
  return splitStringByMediaReferences(value).map((segment, index) =>
    segment.type === "media" ? (
      <span
        key={`${segment.value}-${index}`}
        className="relative -top-px inline-flex"
      >
        <MediaReferenceTag descriptor={segment.descriptor} />
      </span>
    ) : (
      <Fragment key={index}>{segment.value}</Fragment>
    ),
  );
}

/** Read-only evaluator definition with code and LLM states enforced by type. */
export function EvaluatorDefinitionView({
  definition,
}: {
  definition: EvaluatorDefinition;
}) {
  switch (definition.type) {
    case EvalTemplateTypeEnum.CODE:
      return <CodeEvaluatorDefinitionView definition={definition} />;
    case EvalTemplateTypeEnum.DECISION_MODEL:
      return <DecisionModelDefinitionView definition={definition} />;
    case EvalTemplateTypeEnum.LLM_AS_JUDGE:
      return <LlmEvaluatorDefinitionView definition={definition} />;
  }
}
