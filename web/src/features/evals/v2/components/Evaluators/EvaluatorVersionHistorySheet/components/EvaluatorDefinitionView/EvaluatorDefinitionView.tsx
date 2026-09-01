import { Fragment } from "react";
import {
  type EvalTemplateSourceCodeLanguage,
  EvalTemplateTypeEnum,
  type EvalTemplateType,
  type ObservationVariableMapping,
  type EvaluatorPromptMessage,
} from "@langfuse/shared";

import { CodeBlock } from "@/src/components/design-system/Codeblock/Codeblock";
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
          <div key={index} className="flex min-w-0 flex-col gap-1">
            <Badge variant="outline" className="w-fit capitalize">
              {message.role}
            </Badge>
            <PromptVariableEditor
              value={message.content}
              onChange={noop}
              variableMappings={variableLabels}
              readOnly
              validateVariableMappings={false}
              previewEnabled
              preview={{
                status: "ready",
                fragments: [{ type: "text", text: message.content }],
              }}
              renderPreviewText={renderMediaAwareText}
            />
          </div>
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
  return definition.type === EvalTemplateTypeEnum.CODE ? (
    <CodeEvaluatorDefinitionView definition={definition} />
  ) : (
    <LlmEvaluatorDefinitionView definition={definition} />
  );
}
