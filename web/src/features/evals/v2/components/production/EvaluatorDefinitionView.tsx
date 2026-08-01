import { Sparkles } from "lucide-react";
import { SiPython, SiTypescript } from "react-icons/si";
import { Badge } from "@/src/components/ui/badge";
import { Label } from "@/src/components/ui/label";
import { PromptVariableEditor } from "@/src/features/evals/v2/components/PromptVariableEditor";
import { MAPPABLE_COLUMNS } from "@/src/features/evals/v2/components/VariableMappingPopover";
import {
  ScoreOutputSection,
  toScoreOutputFormState,
} from "@/src/features/evals/v2/components/production/ScoreOutputSection";
import { formatMappingLabel } from "@/src/features/evals/v2/lib/jsonPathSegments";
import type { ObservationVariableMapping } from "@langfuse/shared";

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
  return (
    <ScoreOutputSection
      state={toScoreOutputFormState(outputDefinition)}
      onChange={() => undefined}
      readOnly
    />
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
                <span className="text-primary-accent shrink-0 font-mono font-bold">{`{{${mapping.templateVariable}}}`}</span>
                <span className="text-muted-foreground shrink-0">
                  pulls from
                </span>
                <span className="min-w-0 truncate font-bold" title={label}>
                  {label}
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
          <Label>Evaluator type</Label>
          <div className="bg-muted flex h-8 w-fit items-center gap-1.5 rounded-md border px-3 text-sm font-bold">
            {isCode ? (
              sourceCodeLanguage === "TYPESCRIPT" ? (
                <SiTypescript className="h-3.5 w-3.5" />
              ) : (
                <SiPython className="h-3.5 w-3.5" />
              )
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {isCode
              ? sourceCodeLanguage === "TYPESCRIPT"
                ? "TypeScript"
                : "Python"
              : "LLM-as-a-judge"}
          </div>
        </section>
      ) : null}
      {isCode && sourceCodeLanguage ? (
        <section className="flex flex-col gap-2">
          <Label>Code</Label>
          <pre className="bg-muted max-h-96 overflow-auto rounded-md border p-3 font-mono text-sm whitespace-pre-wrap">
            {sourceCode ?? ""}
          </pre>
        </section>
      ) : (
        <>
          <section className="flex min-w-0 flex-col gap-2">
            <Label>Model</Label>
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
          </section>
          <section className="flex min-w-0 flex-col gap-2">
            <Label>Prompt</Label>
            <PromptVariableEditor
              value={prompt ?? ""}
              onChange={() => undefined}
              variableMappings={variableMappings}
              readOnly
            />
          </section>
          {showMappings ? <ReadOnlyMappings mappings={mappings} /> : null}
          <ReadOnlyScoreOutput outputDefinition={outputDefinition} />
        </>
      )}
    </div>
  );
}
