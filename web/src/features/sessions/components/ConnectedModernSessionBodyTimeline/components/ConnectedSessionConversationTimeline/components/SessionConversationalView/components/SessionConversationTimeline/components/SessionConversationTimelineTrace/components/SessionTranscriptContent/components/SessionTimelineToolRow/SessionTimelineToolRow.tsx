import { CircleAlert } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import hljs from "highlight.js/lib/core";
import json from "highlight.js/lib/languages/json";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import yaml from "highlight.js/lib/languages/yaml";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import markdown from "highlight.js/lib/languages/markdown";
import { Highlight, themes } from "prism-react-renderer";
import { useTheme } from "next-themes";
import { SelectDropdown } from "@/src/components/design-system/SelectDropdown/SelectDropdown";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { renderFilterIcon } from "@/src/components/ItemBadge";
import { SessionTimelineCollapsibleRow } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/components/SessionConversationTimelineTrace/components/SessionTranscriptContent/components/SessionTimelineCollapsibleRow/SessionTimelineCollapsibleRow";
import { decodeUnicodeEscapesOnly } from "@/src/utils/unicode";
import { cn } from "@/src/utils/tailwind";

const toPreviewText = (value: unknown) => {
  const text =
    typeof value === "string"
      ? value
      : (JSON.stringify(value, undefined, 2) ?? String(value));
  return decodeUnicodeEscapesOnly(text, true);
};

const hasPreviewValue = (value: unknown) =>
  value !== null && value !== undefined && value !== "";

const languageOptions = [
  { value: "json", label: "JSON", grammar: json },
  { value: "javascript", label: "JavaScript", grammar: javascript },
  { value: "typescript", label: "TypeScript", grammar: typescript },
  { value: "python", label: "Python", grammar: python },
  { value: "sql", label: "SQL", grammar: sql },
  { value: "yaml", label: "YAML", grammar: yaml },
  { value: "xml", label: "HTML / XML", grammar: xml },
  { value: "css", label: "CSS", grammar: css },
  { value: "markdown", label: "Markdown", grammar: markdown },
];

// Prism handles rendering but has no autodetection; only load detection grammars here.
const detector = hljs.newInstance();
for (const { value, grammar } of languageOptions) {
  detector.registerLanguage(value, grammar);
}

function SessionTimelineToolPreview({
  value,
  kind,
}: {
  value: unknown;
  kind: "input" | "output";
}) {
  const [selectedLanguage, setSelectedLanguage] = useState("auto");
  const { resolvedTheme } = useTheme();
  const text = useMemo(() => toPreviewText(value), [value]);
  const detectedLanguage = useMemo(() => {
    if (typeof value !== "string") return "json";
    // Bound detection work for large tool responses in the virtualized timeline.
    return detector.highlightAuto(text.slice(0, 10_000)).language ?? "text";
  }, [value, text]);
  const language =
    selectedLanguage === "auto" ? detectedLanguage : selectedLanguage;
  const detectedLabel =
    languageOptions.find((option) => option.value === detectedLanguage)
      ?.label ?? "Plain text";

  return (
    <div className="relative flex min-w-0 flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground font-mono text-[10px] font-bold uppercase">
          {kind === "input" ? "Input" : "Output"}
        </span>
        <SelectDropdown
          aria-label={`Tool ${kind} language`}
          value={selectedLanguage}
          onValueChange={setSelectedLanguage}
          options={[
            { value: "auto", label: `Auto (${detectedLabel})` },
            { value: "text", label: "Plain text" },
            ...languageOptions.map(({ value, label }) => ({ value, label })),
          ]}
        >
          {({ getTriggerProps, selectedLabel }) => (
            <button
              {...getTriggerProps()}
              className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs focus-visible:ring-2 focus-visible:outline-hidden"
            >
              {selectedLabel}
              <DropdownIndicator />
            </button>
          )}
        </SelectDropdown>
      </div>
      <Highlight
        code={text}
        language={language}
        theme={resolvedTheme === "dark" ? themes.vsDark : themes.github}
      >
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre
            className={cn(
              "bg-muted/30 overflow-auto rounded-md border p-3 font-mono text-xs break-all whitespace-pre-wrap",
              kind === "input" ? "max-h-48" : "max-h-96",
            )}
          >
            {tokens.map((line, index) => (
              <div key={index} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}

export function SessionTimelineToolRow({
  name,
  input,
  output,
  isExpanded,
  onExpandedChange,
  isError,
  trailingContent,
}: {
  name: string;
  input: unknown;
  output: unknown;
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
  isError?: boolean;
  trailingContent?: ReactNode;
}) {
  return (
    <SessionTimelineCollapsibleRow
      label={name}
      searchableLabel
      icon={renderFilterIcon("TOOL")}
      isExpanded={isExpanded}
      onExpandedChange={onExpandedChange}
      trailingContent={
        <>
          {trailingContent}
          {isError ? (
            <CircleAlert
              className="icon-sm text-destructive"
              aria-label="Failed"
            />
          ) : null}
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-3 pl-[22px]">
        {hasPreviewValue(input) ? (
          <SessionTimelineToolPreview kind="input" value={input} />
        ) : null}
        {hasPreviewValue(output) ? (
          <SessionTimelineToolPreview kind="output" value={output} />
        ) : null}
        {!hasPreviewValue(input) && !hasPreviewValue(output) ? (
          <div className="relative">
            <span className="text-muted-foreground text-xs">
              No input or output
            </span>
          </div>
        ) : null}
      </div>
    </SessionTimelineCollapsibleRow>
  );
}
