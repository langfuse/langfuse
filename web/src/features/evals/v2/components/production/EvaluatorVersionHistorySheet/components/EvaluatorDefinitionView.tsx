import type { ObservationVariableMapping } from "@langfuse/shared";
import type { ReactNode } from "react";

import { CodeBlock } from "@/src/components/design-system/Codeblock/Codeblock";
import { Badge } from "@/src/components/ui/badge";
import { Label } from "@/src/components/ui/label";
import { EvaluatorTypeBadge } from "@/src/features/evals/v2/components/production/EvaluatorTypeBadge/EvaluatorTypeBadge";
import { ScoreOutputConfiguration } from "@/src/features/evals/v2/components/production/ScoreOutputConfiguration/ScoreOutputConfiguration";
import { VariableMapping } from "@/src/features/evals/v2/components/production/VariableMapping";
import { toScoreOutputFormState } from "@/src/features/evals/v2/fns/toScoreOutputFormState";

type Model = { provider: string; model: string };

export type EvaluatorDefinition =
  | {
      type: "CODE";
      sourceCode: string | null;
      sourceCodeLanguage: "PYTHON" | "TYPESCRIPT" | null;
    }
  | {
      type: "LLM_AS_JUDGE";
      prompt: string | null;
      selectedModel: Model | null;
      defaultModel: Model | null;
      outputDefinition: unknown;
      variableMappings:
        | { state: "hidden" }
        | { state: "visible"; mappings: ObservationVariableMapping[] };
    };

function DefinitionExecutionSummary({
  children,
  type,
}: {
  children: ReactNode;
  type: "CODE" | "LLM_AS_JUDGE";
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>Evaluation</Label>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <EvaluatorTypeBadge type={type} />
        {children}
      </div>
    </div>
  );
}

function CodeEvaluatorDefinitionView({
  definition,
}: {
  definition: Extract<EvaluatorDefinition, { type: "CODE" }>;
}) {
  const language =
    definition.sourceCodeLanguage === "TYPESCRIPT" ? "TypeScript" : "Python";

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <DefinitionExecutionSummary type="CODE">
        <span>written in</span>
        <Badge variant="outline">{language}</Badge>
      </DefinitionExecutionSummary>
      <section className="flex flex-col gap-2">
        <Label>Code</Label>
        <CodeBlock
          language={language.toLowerCase()}
          value={definition.sourceCode ?? ""}
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
  const model = definition.selectedModel ?? definition.defaultModel;
  const modelLabel = model
    ? `${model.provider} / ${model.model}`
    : "No model configured";

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <DefinitionExecutionSummary type="LLM_AS_JUDGE">
        <span>with</span>
        <Badge variant="outline">{modelLabel}</Badge>
        {!definition.selectedModel && definition.defaultModel ? (
          <Badge variant="secondary">Project default</Badge>
        ) : null}
      </DefinitionExecutionSummary>
      <section className="flex min-w-0 flex-col gap-2">
        <Label>Prompt</Label>
        <CodeBlock language="text" value={definition.prompt ?? ""} />
      </section>
      {definition.variableMappings.state === "visible" ? (
        <section className="flex flex-col gap-2">
          <Label>Prompt variables</Label>
          <VariableMapping
            mode="read-only"
            mappings={definition.variableMappings.mappings.map((mapping) => ({
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

/** Read-only evaluator definition with code and LLM states enforced by type. */
export function EvaluatorDefinitionView({
  definition,
}: {
  definition: EvaluatorDefinition;
}) {
  return definition.type === "CODE" ? (
    <CodeEvaluatorDefinitionView definition={definition} />
  ) : (
    <LlmEvaluatorDefinitionView definition={definition} />
  );
}
