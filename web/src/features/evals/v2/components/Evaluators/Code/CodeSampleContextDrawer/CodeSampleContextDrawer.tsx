import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { useTheme } from "next-themes";
import { useMemo } from "react";

import { darkTheme } from "@/src/components/editor/dark-theme";
import { lightTheme } from "@/src/components/editor/light-theme";
import { CollapsibleCard } from "@/src/features/evals/v2/components/CollapsibleCard/CollapsibleCard";
import {
  EvalTemplateSourceCodeLanguageEnum,
  type EvalTemplateSourceCodeLanguage,
  deepParseJsonIterative,
} from "@langfuse/shared";

// The preview teaches shape, not full content: long strings and arrays are
// clipped so a huge sample can't bury the structure.
const MAX_STRING_LENGTH = 200;
const MAX_ARRAY_ITEMS = 20;

function truncate(value: string): string {
  return value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH)}…`
    : value;
}

const IDENTIFIER_REGEX = /^[A-Za-z_$][\w$]*$/;

function serializeValue(
  value: unknown,
  language: EvalTemplateSourceCodeLanguage,
  indent: string,
): string {
  if (value === null || value === undefined) {
    return language === EvalTemplateSourceCodeLanguageEnum.PYTHON
      ? "None"
      : String(value);
  }
  if (typeof value === "string") return JSON.stringify(truncate(value));
  if (typeof value === "boolean") {
    return language === EvalTemplateSourceCodeLanguageEnum.PYTHON
      ? value
        ? "True"
        : "False"
      : String(value);
  }
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const childIndent = `${indent}  `;
    const lines = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map(
        (item) =>
          `${childIndent}${serializeValue(item, language, childIndent)},`,
      );
    if (value.length > MAX_ARRAY_ITEMS) {
      const comment =
        language === EvalTemplateSourceCodeLanguageEnum.PYTHON ? "#" : "//";
      lines.push(
        `${childIndent}${comment} … ${value.length - MAX_ARRAY_ITEMS} more items`,
      );
    }
    return `[\n${lines.join("\n")}\n${indent}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const childIndent = `${indent}  `;
    const lines = entries.map(([key, entry]) => {
      const keyLiteral =
        language === EvalTemplateSourceCodeLanguageEnum.TYPESCRIPT &&
        IDENTIFIER_REGEX.test(key)
          ? key
          : JSON.stringify(key);
      return `${childIndent}${keyLiteral}: ${serializeValue(entry, language, childIndent)},`;
    });
    return `{\n${lines.join("\n")}\n${indent}}`;
  }
  return JSON.stringify(String(value));
}

/**
 * Renders the sample as the literal the evaluator receives, in the language
 * the user is writing — the code-mode counterpart of the prompt's
 * interpolated preview.
 */
function buildContextSnippet(
  sampleObservation: Record<string, unknown>,
  language: EvalTemplateSourceCodeLanguage,
): string {
  // Same deep-parsed shape as the test run hands to evaluate().
  const observation = {
    input: deepParseJsonIterative(sampleObservation.input),
    output: deepParseJsonIterative(sampleObservation.output),
    metadata: deepParseJsonIterative(sampleObservation.metadata),
    // Tool calls are already normalized by extraction. Deep-parsing them can
    // corrupt string-valued identifiers such as a tool named "true".
    toolCalls: Array.isArray(sampleObservation.toolCalls)
      ? sampleObservation.toolCalls
      : [],
  };
  const hasExperimentContext =
    "experimentItemExpectedOutput" in sampleObservation ||
    "experimentItemMetadata" in sampleObservation;
  const experiment = hasExperimentContext
    ? {
        itemExpectedOutput: deepParseJsonIterative(
          sampleObservation.experimentItemExpectedOutput ?? null,
        ),
        itemMetadata: deepParseJsonIterative(
          sampleObservation.experimentItemMetadata ?? null,
        ),
      }
    : undefined;

  if (language === EvalTemplateSourceCodeLanguageEnum.TYPESCRIPT) {
    const payload = { observation, ...(experiment ? { experiment } : {}) };
    return `const ctx = ${serializeValue(payload, language, "")};`;
  }

  const fields = (["input", "output", "metadata", "toolCalls"] as const)
    .map(
      (key) =>
        `    ${key}=${serializeValue(observation[key], language, "    ")},`,
    )
    .join("\n");
  const experimentSnippet = experiment
    ? `,\n  experiment=ExperimentContext(\n    itemExpectedOutput=${serializeValue(experiment.itemExpectedOutput, language, "    ")},\n    itemMetadata=${serializeValue(experiment.itemMetadata, language, "    ")},\n  )`
    : "";
  return `ctx = EvaluationContext(\n  observation=ObservationContext(\n${fields}\n  )${experimentSnippet},\n)`;
}

function SampleSnippetView({
  sampleObservation,
  language,
}: {
  sampleObservation: Record<string, unknown>;
  language: EvalTemplateSourceCodeLanguage;
}) {
  const { resolvedTheme } = useTheme();

  const snippet = useMemo(
    () => buildContextSnippet(sampleObservation, language),
    [sampleObservation, language],
  );

  const extensions = useMemo(
    () => [
      language === EvalTemplateSourceCodeLanguageEnum.PYTHON
        ? python()
        : javascript({ typescript: true }),
      EditorState.readOnly.of(true),
      EditorView.lineWrapping,
      EditorView.theme({
        "&.cm-focused": { outline: "none" },
        ".cm-scroller": { maxHeight: "40dvh", overflow: "auto" },
      }),
    ],
    [language],
  );

  return (
    <CodeMirror
      value={snippet}
      theme={resolvedTheme === "dark" ? darkTheme : lightTheme}
      basicSetup={{
        lineNumbers: false,
        foldGutter: true,
        highlightActiveLine: false,
      }}
      extensions={extensions}
      editable={false}
      className="text-xs"
    />
  );
}

/**
 * Standalone drawer showing the sample as the `ctx = …` literal the evaluator
 * receives. The header strip is the control, so the toggle and content cannot
 * drift apart.
 */
export function CodeSampleContextDrawer({
  open,
  onOpenChange,
  sampleObservation,
  sampleLabel,
  language,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sampleObservation: Record<string, unknown> | null;
  /** Name/id of the selected sample, shown in the drawer strip. */
  sampleLabel: string | null;
  language: EvalTemplateSourceCodeLanguage;
}) {
  const hasSampleData = sampleObservation !== null;
  const expanded = open && hasSampleData;

  return (
    <CollapsibleCard
      open={expanded}
      onOpenChange={onOpenChange}
      disabled={!hasSampleData}
      triggerTitle={
        !hasSampleData
          ? "Pick a sample observation to preview the data your code receives"
          : expanded
            ? "Hide the sample data"
            : "Show the data your code receives, as the ctx it will be called with"
      }
      header={
        <>
          <span className="font-bold">
            Sample data mapping{" "}
            <code className="font-mono font-normal">(ctx)</code>
          </span>
          {sampleLabel ? (
            <span
              className="text-muted-foreground truncate"
              title={sampleLabel}
            >
              · {sampleLabel}
            </span>
          ) : (
            <span className="text-muted-foreground">
              · no sample data available
            </span>
          )}
        </>
      }
      actions={null}
    >
      <div className="max-h-[calc(100dvh-12rem)] overflow-y-auto [&_.cm-editor]:bg-transparent [&_.cm-gutters]:bg-transparent">
        {sampleObservation ? (
          <SampleSnippetView
            sampleObservation={sampleObservation}
            language={language}
          />
        ) : (
          <p className="text-muted-foreground p-3 text-sm">
            Pick a sample observation in the right pane to see the data your
            code receives.
          </p>
        )}
      </div>
    </CollapsibleCard>
  );
}
