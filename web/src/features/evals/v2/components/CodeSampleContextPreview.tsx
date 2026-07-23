import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTheme } from "next-themes";
import { useMemo } from "react";

import { darkTheme } from "@/src/components/editor/dark-theme";
import { lightTheme } from "@/src/components/editor/light-theme";
import { cn } from "@/src/utils/tailwind";
import { deepParseJson } from "@langfuse/shared";

type CodeEvalLanguage = "PYTHON" | "TYPESCRIPT";

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
  language: CodeEvalLanguage,
  indent: string,
): string {
  if (value === null || value === undefined) {
    return language === "PYTHON" ? "None" : String(value);
  }
  if (typeof value === "string") return JSON.stringify(truncate(value));
  if (typeof value === "boolean") {
    return language === "PYTHON" ? (value ? "True" : "False") : String(value);
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
      const comment = language === "PYTHON" ? "#" : "//";
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
        language === "TYPESCRIPT" && IDENTIFIER_REGEX.test(key)
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
  language: CodeEvalLanguage,
): string {
  // Same deep-parsed shape as the test run hands to evaluate().
  const observation = {
    input: deepParseJson(sampleObservation.input),
    output: deepParseJson(sampleObservation.output),
    metadata: deepParseJson(sampleObservation.metadata),
  };

  if (language === "TYPESCRIPT") {
    return `const ctx = {\n  observation: ${serializeValue(observation, language, "  ")},\n};`;
  }

  const fields = (["input", "output", "metadata"] as const)
    .map(
      (key) =>
        `    ${key}=${serializeValue(observation[key], language, "    ")},`,
    )
    .join("\n");
  return `ctx = EvaluationContext(\n  observation=ObservationContext(\n${fields}\n  ),\n)`;
}

function SampleSnippetView({
  sampleObservation,
  language,
}: {
  sampleObservation: Record<string, unknown>;
  language: CodeEvalLanguage;
}) {
  const { resolvedTheme } = useTheme();

  const snippet = useMemo(
    () => buildContextSnippet(sampleObservation, language),
    [sampleObservation, language],
  );

  const extensions = useMemo(
    () => [
      language === "PYTHON" ? python() : javascript({ typescript: true }),
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
  language: CodeEvalLanguage;
}) {
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <>
      <button
        type="button"
        className={cn(
          "bg-primary/5 hover:bg-primary/10 text-muted-foreground hover:text-foreground flex w-full items-center gap-2 border px-3 py-1.5 text-sm",
          open ? "rounded-t-md" : "rounded-md",
        )}
        title={
          open
            ? "Hide the sample data"
            : "Show the data your code receives, as the ctx it will be called with"
        }
        onClick={() => onOpenChange(!open)}
      >
        <Chevron className="h-3.5 w-3.5 shrink-0" />
        <span className="font-bold">
          Sample data <code className="font-mono font-normal">(ctx)</code>
        </span>
        {sampleLabel ? (
          <span className="truncate" title={sampleLabel}>
            · {sampleLabel}
          </span>
        ) : (
          <span>· no sample picked yet</span>
        )}
      </button>
      {open && (
        <div className="bg-muted/30 max-h-[calc(100dvh-12rem)] overflow-y-auto rounded-b-md border border-t-0 [&_.cm-editor]:bg-transparent [&_.cm-gutters]:bg-transparent">
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
      )}
    </>
  );
}
