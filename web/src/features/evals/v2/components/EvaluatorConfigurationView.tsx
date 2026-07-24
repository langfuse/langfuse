import { Code2, Sparkles } from "lucide-react";
import { SiPython, SiTypescript } from "react-icons/si";

import { renderFilterIcon } from "@/src/components/ItemBadge";
import { Badge } from "@/src/components/ui/badge";
import { Label } from "@/src/components/ui/label";
import { CodeEvalTemplateFormBody } from "@/src/features/evals/components/code-eval-template-form-body";
import { PromptVariableEditor } from "@/src/features/evals/v2/components/PromptVariableEditor";
import { MAPPABLE_COLUMNS } from "@/src/features/evals/v2/components/VariableMappingPopover";
import {
  ScoreOutputSection,
  toScoreOutputFormState,
} from "@/src/features/evals/v2/components/ScoreOutputSection";
import { formatMappingLabel } from "@/src/features/evals/v2/lib/jsonPathSegments";
import { type ObservationVariableMapping } from "@langfuse/shared";

function mappingLabel(mapping: ObservationVariableMapping): string {
  const columnLabel =
    MAPPABLE_COLUMNS.find((column) => column.id === mapping.selectedColumnId)
      ?.label ?? mapping.selectedColumnId;
  return formatMappingLabel(columnLabel, mapping.jsonSelector ?? null);
}

function ReadOnlyScoreOutput({
  outputDefinition,
}: {
  outputDefinition: unknown;
}) {
  const output = toScoreOutputFormState(outputDefinition);

  return (
    <ScoreOutputSection state={output} onChange={() => undefined} readOnly />
  );
}

function ReadOnlyMappings({
  mappings,
}: {
  mappings: ObservationVariableMapping[];
}) {
  return (
    <section className="flex flex-col gap-2">
      <Label>Prompt variables</Label>
      {mappings.length > 0 ? (
        <div className="flex flex-col gap-2">
          {mappings.map((mapping) => {
            const label = mappingLabel(mapping);
            return (
              <div
                key={mapping.templateVariable}
                className="bg-muted/30 flex min-w-0 items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
              >
                <span className="text-primary-accent shrink-0 font-mono font-bold">
                  {`{{${mapping.templateVariable}}}`}
                </span>
                <span className="text-muted-foreground shrink-0">
                  pulls from
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="shrink-0"
                    title="Observation field"
                    aria-label="Observation field"
                  >
                    {renderFilterIcon("TRACE")}
                  </span>
                  <span className="min-w-0 truncate font-bold" title={label}>
                    {label}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          This prompt has no variables.
        </p>
      )}
    </section>
  );
}

export function EvaluatorDefinitionView({
  evaluatorType,
  sourceCode,
  sourceCodeLanguage,
  prompt,
  modelLabel,
  usesProjectDefaultModel,
  outputDefinition,
  mappings,
  showMappings = true,
  showType = true,
}: {
  evaluatorType: "LLM_AS_JUDGE" | "CODE";
  sourceCode: string | null;
  sourceCodeLanguage: "PYTHON" | "TYPESCRIPT" | null;
  prompt: string | null;
  modelLabel: string;
  usesProjectDefaultModel: boolean;
  outputDefinition: unknown;
  mappings: ObservationVariableMapping[];
  showMappings?: boolean;
  showType?: boolean;
}) {
  const isCode = evaluatorType === "CODE";
  const variableMappings = showMappings
    ? Object.fromEntries(
        mappings.map((mapping) => [
          mapping.templateVariable,
          mappingLabel(mapping),
        ]),
      )
    : {};

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {showType ? (
        <section className="flex flex-col gap-2">
          <Label>Evaluation</Label>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Run using</span>
            <div className="bg-background flex h-8 items-center gap-1.5 rounded-md border px-3 font-bold">
              {isCode ? (
                <Code2 className="h-3.5 w-3.5" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {isCode ? "Code evaluator" : "LLM-as-a-judge"}
            </div>
            {isCode ? (
              <>
                <span>written in</span>
                <div className="bg-background flex h-8 items-center gap-1.5 rounded-md border px-3 font-bold">
                  {sourceCodeLanguage === "TYPESCRIPT" ? (
                    <SiTypescript className="h-3.5 w-3.5" />
                  ) : (
                    <SiPython className="h-3.5 w-3.5" />
                  )}
                  {sourceCodeLanguage === "TYPESCRIPT"
                    ? "TypeScript"
                    : "Python"}
                </div>
              </>
            ) : (
              <>
                <span>with</span>
                <div className="bg-background flex h-8 max-w-full items-center gap-2 rounded-md border px-3">
                  <span className="truncate" title={modelLabel}>
                    {modelLabel}
                  </span>
                  {usesProjectDefaultModel ? (
                    <Badge variant="secondary" size="sm">
                      Project default
                    </Badge>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </section>
      ) : null}

      {isCode && sourceCodeLanguage ? (
        <section className="flex flex-col gap-2">
          <Label>Code</Label>
          <CodeEvalTemplateFormBody
            sourceCode={sourceCode ?? ""}
            sourceCodeLanguage={sourceCodeLanguage}
            onSourceCodeChange={() => undefined}
            editable={false}
            validationResult={null}
            hideLanguageLabel
            hideFunctionContractHint
          />
        </section>
      ) : (
        <>
          <div
            className={
              showMappings
                ? "grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]"
                : "min-w-0"
            }
          >
            <section className="flex min-w-0 flex-col gap-2">
              <Label>Prompt</Label>
              {!showType ? (
                <div className="flex w-fit max-w-full items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                  <span className="truncate" title={modelLabel}>
                    {modelLabel}
                  </span>
                  {usesProjectDefaultModel ? (
                    <Badge variant="secondary" size="sm">
                      Project default
                    </Badge>
                  ) : null}
                </div>
              ) : null}
              <PromptVariableEditor
                value={prompt ?? ""}
                onChange={() => undefined}
                variableMappings={variableMappings}
                onVariableClick={() => undefined}
                readOnly
              />
            </section>
            {showMappings ? <ReadOnlyMappings mappings={mappings} /> : null}
          </div>
          <ReadOnlyScoreOutput outputDefinition={outputDefinition} />
        </>
      )}
    </div>
  );
}
