import { memo, useMemo, useState } from "react";
import { Check, Copy, ListTree } from "lucide-react";
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
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { SelectDropdown } from "@/src/components/design-system/SelectDropdown/SelectDropdown";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";
import { cn } from "@/src/utils/tailwind";
import { formatJson } from "@/src/utils/formatJson";
import { normalizeCodeblockLanguage } from "@/src/utils/normalizeCodeblockLanguage";

export type CodeblockLanguage =
  | "plain"
  | "plaintext"
  | "text"
  | "txt"
  | "markup"
  | "html"
  | "mathml"
  | "svg"
  | "xml"
  | "ssml"
  | "atom"
  | "rss"
  | "regex"
  | "clike"
  | "javascript"
  | "js"
  | "actionscript"
  | "coffeescript"
  | "coffee"
  | "javadoclike"
  | "css"
  | "yaml"
  | "yml"
  | "markdown"
  | "md"
  | "graphql"
  | "sql"
  | "typescript"
  | "ts"
  | "jsdoc"
  | "flow"
  | "n4js"
  | "n4jsd"
  | "jsx"
  | "tsx"
  | "swift"
  | "kotlin"
  | "kt"
  | "kts"
  | "c"
  | "objectivec"
  | "objc"
  | "reason"
  | "rust"
  | "go"
  | "cpp"
  | "python"
  | "py"
  | "json"
  | "webmanifest"
  | "bash"
  | "shell";

interface CodeblockProps {
  /** Use a labelled grammar when the source language has no matching grammar. */
  language?: CodeblockLanguage | { value: CodeblockLanguage; label: string };
  value: unknown;
  label?: string;
  allowFormatting?: boolean;
  theme?: "light" | "dark";
  borderless?: boolean;
  /** Hide the language caption when the surrounding UI already states it. */
  showLanguage?: boolean;
  /** Match immutable form fields instead of using the recessed code surface. */
  variant?: "default" | "read-only";
}

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
] as const;

// Prism handles rendering but has no autodetection; only load detection grammars here.
const detector = hljs.newInstance();
for (const { value, grammar } of languageOptions) {
  detector.registerLanguage(value, grammar);
}

export const Codeblock = memo(function Codeblock({
  language: languageConfig,
  value,
  label = "Code",
  allowFormatting = false,
  theme,
  borderless = false,
  showLanguage = true,
  variant = "default",
}: CodeblockProps) {
  const configuredLanguage =
    typeof languageConfig === "string" ? languageConfig : languageConfig?.value;
  const languageLabel =
    typeof languageConfig === "string" ? undefined : languageConfig?.label;
  const [selectedLanguage, setSelectedLanguage] = useState<
    "auto" | CodeblockLanguage
  >("auto");
  const [format, setFormat] = useState<"original" | "pretty">("pretty");
  const { copy, isCopied } = useCopyToClipboard();
  const text = useMemo(() => {
    if (typeof value === "string") return value;
    return JSON.stringify(value, undefined, 2) ?? String(value);
  }, [value]);
  const formattedJson = useMemo(() => {
    if (!allowFormatting) return null;
    return formatJson(text);
  }, [allowFormatting, text]);
  const isLargePreview = text.length > MAX_HIGHLIGHT_CHARACTERS;
  const detectedLanguage = useMemo(() => {
    if (configuredLanguage !== undefined) return configuredLanguage;
    if (formattedJson !== null) return "json";
    if (isLargePreview) return "text";
    if (typeof value !== "string") return "json";
    return normalizeCodeblockLanguage(
      detector.highlightAuto(text).language ?? "text",
    );
  }, [configuredLanguage, formattedJson, isLargePreview, value, text]);
  const language =
    configuredLanguage ??
    (selectedLanguage === "auto" ? detectedLanguage : selectedLanguage);
  const prettyPrintedText = language === "json" ? formattedJson : null;
  const displayText =
    format === "pretty" && prettyPrintedText !== null
      ? prettyPrintedText
      : text;
  const detectedLabel =
    languageOptions.find((option) => option.value === detectedLanguage)
      ?.label ?? "Plain text";
  const bypassHighlighting =
    isLargePreview ||
    displayText.length > MAX_HIGHLIGHT_CHARACTERS ||
    language === "text";
  const codePadding =
    variant === "read-only" ? "0.75rem 2.5rem 0.75rem 0.75rem" : "0.75rem";
  const codeClassName = cn(
    "min-h-0 overflow-auto font-mono text-xs",
    variant === "read-only"
      ? "whitespace-pre"
      : "break-all whitespace-pre-wrap",
  );

  const handleCopy = () =>
    copy(displayText).catch((error: unknown) => {
      console.error("Failed to copy code", error);
    });
  const handleFormatToggle = () => {
    setFormat((previous) => (previous === "pretty" ? "original" : "pretty"));
  };
  const handleLanguageChange = (language: string) => {
    if (language === "auto") {
      setSelectedLanguage("auto");
      return;
    }
    setSelectedLanguage(normalizeCodeblockLanguage(language));
  };

  return (
    <div
      className={cn(
        "codeblock relative flex min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-md font-sans",
        !borderless && "border",
        variant === "read-only" ? "bg-muted" : "bg-muted/30",
      )}
    >
      {variant === "read-only" ? (
        <div className="text-muted-foreground absolute top-1.5 right-1.5">
          <IconButton
            icon={isCopied ? Check : Copy}
            label="Copy code"
            size="xs"
            variant="ghost"
            onClick={handleCopy}
          />
        </div>
      ) : (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-b px-2 py-1">
          {configuredLanguage !== undefined && showLanguage ? (
            <span className="text-muted-foreground inline-flex items-center rounded px-1.5 py-1 text-xs">
              {languageLabel ??
                languageOptions.find(
                  (option) => option.value === configuredLanguage,
                )?.label ??
                configuredLanguage}
            </span>
          ) : null}
          {configuredLanguage === undefined ? (
            <SelectDropdown
              aria-label={`${label} language`}
              value={selectedLanguage}
              onValueChange={handleLanguageChange}
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
          ) : null}
          {isLargePreview || displayText.length > MAX_HIGHLIGHT_CHARACTERS ? (
            <span
              className="text-muted-foreground text-xs"
              title="Syntax highlighting is disabled for previews over 10,000 characters."
            >
              Plain text (large value)
            </span>
          ) : null}
          {prettyPrintedText !== null ? (
            <Tooltip label="Pretty-print JSON">
              {({ getTriggerProps }) => (
                <IconButton
                  {...getTriggerProps()}
                  label="Pretty-print JSON"
                  icon={ListTree}
                  variant="toolbar"
                  size="sm"
                  aria-pressed={format === "pretty"}
                  onClick={handleFormatToggle}
                />
              )}
            </Tooltip>
          ) : null}
          <Tooltip label={isCopied ? "Copied" : "Copy code"}>
            {({ getTriggerProps }) => (
              <IconButton
                {...getTriggerProps()}
                label={isCopied ? "Copied" : "Copy code"}
                icon={isCopied ? Check : Copy}
                variant="toolbar"
                size="sm"
                onClick={handleCopy}
              />
            )}
          </Tooltip>
        </div>
      )}
      {bypassHighlighting ? (
        <pre className={codeClassName} style={{ padding: codePadding }}>
          {displayText}
        </pre>
      ) : (
        <SyntaxHighlight theme={theme} code={displayText} language={language}>
          {({ className, style, content }) => (
            <pre
              className={cn(className, codeClassName)}
              style={{
                ...style,
                margin: 0,
                width: "100%",
                background: "transparent",
                padding: codePadding,
                fontSize: "0.75rem",
                fontFamily: "var(--font-mono)",
                overflow: "auto",
              }}
            >
              {content}
            </pre>
          )}
        </SyntaxHighlight>
      )}
    </div>
  );
});
