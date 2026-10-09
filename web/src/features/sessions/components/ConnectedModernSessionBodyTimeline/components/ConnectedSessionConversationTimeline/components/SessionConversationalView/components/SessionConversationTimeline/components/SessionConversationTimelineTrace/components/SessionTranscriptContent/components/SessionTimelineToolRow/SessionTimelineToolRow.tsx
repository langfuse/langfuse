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
import { SyntaxHighlight } from "@/src/components/design-system/SyntaxHighlight/SyntaxHighlight";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
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

const MAX_HIGHLIGHT_CHARACTERS = 10_000;

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
  const [previewFormat, setPreviewFormat] = useState<"original" | "pretty">(
    "pretty",
  );
  const text = useMemo(() => toPreviewText(value), [value]);
  const isLargePreview = text.length > MAX_HIGHLIGHT_CHARACTERS;
  const detectedLanguage = useMemo(() => {
    if (isLargePreview) return "text";
    if (typeof value !== "string") return "json";
    return detector.highlightAuto(text).language ?? "text";
  }, [isLargePreview, value, text]);
  const language =
    selectedLanguage === "auto" ? detectedLanguage : selectedLanguage;
  const prettyPrintedText = useMemo(() => {
    if (language !== "json") return null;
    try {
      const parsed: unknown =
        typeof value === "string" ? JSON.parse(value) : value;
      return JSON.stringify(parsed, null, 2) ?? null;
    } catch {
      return null;
    }
  }, [language, value]);
  const displayText =
    previewFormat === "pretty" && prettyPrintedText !== null
      ? prettyPrintedText
      : text;
  const isLargeDisplay = displayText.length > MAX_HIGHLIGHT_CHARACTERS;
  const detectedLabel =
    languageOptions.find((option) => option.value === detectedLanguage)
      ?.label ?? "Plain text";
  const previewClassName = cn(
    "bg-muted/30 overflow-auto rounded-md border p-3 font-mono text-xs break-all whitespace-pre-wrap",
    kind === "input" ? "max-h-48" : "max-h-96",
  );

  return (
    <div className="relative flex min-w-0 flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground font-mono text-[10px] font-bold uppercase">
          {kind === "input" ? "Input" : "Output"}
        </span>
        <div className="flex items-center gap-2">
          {isLargePreview ? (
            <span
              className="text-muted-foreground px-1.5 py-1 text-xs"
              title="Syntax highlighting is disabled for previews over 10,000 characters."
            >
              Plain text (large value)
            </span>
          ) : (
            <SelectDropdown
              aria-label={`Tool ${kind} language`}
              value={selectedLanguage}
              onValueChange={setSelectedLanguage}
              options={[
                { value: "auto", label: `Auto (${detectedLabel})` },
                { value: "text", label: "Plain text" },
                ...languageOptions.map(({ value, label }) => ({
                  value,
                  label,
                })),
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
          )}
        </div>
      </div>
      <div className="relative min-w-0">
        {prettyPrintedText !== null ? (
          <div className="bg-background absolute top-2 right-2 z-10 rounded-md">
            <Tabs
              value={previewFormat}
              onValueChange={(format) => {
                if (format === "original" || format === "pretty") {
                  setPreviewFormat(format);
                }
              }}
            >
              <Tabs.List
                variant="inset"
                size="sm"
                aria-label={`Tool ${kind} format`}
              >
                <Tabs.Trigger value="original" label="Original" />
                <Tabs.Trigger value="pretty" label="Pretty" />
              </Tabs.List>
            </Tabs>
          </div>
        ) : null}
        {isLargePreview || isLargeDisplay || language === "text" ? (
          <pre className={previewClassName}>{displayText}</pre>
        ) : (
          <SyntaxHighlight code={displayText} language={language}>
            {({ content }) => <pre className={previewClassName}>{content}</pre>}
          </SyntaxHighlight>
        )}
      </div>
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
