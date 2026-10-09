import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Check, Copy, ListTree } from "lucide-react";
import { type FC, memo, useMemo, useState } from "react";
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
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { SelectDropdown } from "@/src/components/design-system/SelectDropdown/SelectDropdown";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { SyntaxHighlight } from "@/src/components/design-system/SyntaxHighlight/SyntaxHighlight";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";
import { decodeUnicodeEscapesOnly } from "@/src/utils/unicode";
import { cn } from "@/src/utils/tailwind";
import { assertUnreachable } from "@/src/utils/types";
import { normalizeCodeblockLanguage } from "@/src/utils/normalizeCodeblockLanguage";

interface Props {
  language?: ReturnType<typeof normalizeCodeblockLanguage>;
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
];

// Prism handles rendering but has no autodetection; only load detection grammars here.
const detector = hljs.newInstance();
for (const { value, grammar } of languageOptions) {
  detector.registerLanguage(value, grammar);
}

const CodeBlock: FC<Props> = memo(
  ({
    language: configuredLanguage,
    value,
    label = "Code",
    allowFormatting = false,
    theme,
    borderless = false,
    showLanguage = true,
    variant = "default",
  }) => {
    const [selectedLanguage, setSelectedLanguage] = useState<
      "auto" | ReturnType<typeof normalizeCodeblockLanguage>
    >("auto");
    const [format, setFormat] = useState<"original" | "pretty">("pretty");
    const { copy, isCopied } = useCopyToClipboard();
    const text = useMemo(() => {
      const originalText =
        typeof value === "string"
          ? value
          : (JSON.stringify(value, undefined, 2) ?? String(value));
      if (configuredLanguage === undefined) {
        return decodeUnicodeEscapesOnly(originalText, true);
      }
      return originalText;
    }, [value, configuredLanguage]);
    const isLargePreview =
      configuredLanguage === undefined &&
      text.length > MAX_HIGHLIGHT_CHARACTERS;
    const detectedLanguage = useMemo(() => {
      if (configuredLanguage !== undefined) return configuredLanguage;
      if (isLargePreview) return "text";
      if (typeof value !== "string") return "json";
      return normalizeCodeblockLanguage(
        detector.highlightAuto(text).language ?? "text",
      );
    }, [configuredLanguage, isLargePreview, value, text]);
    const language =
      configuredLanguage ??
      (selectedLanguage === "auto" ? detectedLanguage : selectedLanguage);
    const prettyPrintedText = useMemo(() => {
      if (!allowFormatting || language !== "json") return null;
      try {
        const parsed: unknown =
          typeof value === "string" ? JSON.parse(value) : value;
        return JSON.stringify(parsed, null, 2) ?? null;
      } catch {
        return null;
      }
    }, [allowFormatting, language, value]);
    const displayText =
      format === "pretty" && prettyPrintedText !== null
        ? prettyPrintedText
        : text;
    const detectedLabel =
      languageOptions.find((option) => option.value === detectedLanguage)
        ?.label ?? "Plain text";
    const handleCopy = () => {
      return copy(displayText).catch((error: unknown) => {
        console.error("Failed to copy code", error);
      });
    };

    const CopyIcon = isCopied ? Check : Copy;
    const copyButton =
      variant === "default" ? (
        <Tooltip label={isCopied ? "Copied" : "Copy code"}>
          {({ getTriggerProps }) => (
            <button
              {...getTriggerProps()}
              type="button"
              aria-label={isCopied ? "Copied" : "Copy code"}
              onClick={handleCopy}
              className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring inline-flex size-6 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-hidden"
            >
              <CopyIcon className="icon-sm" aria-hidden />
            </button>
          )}
        </Tooltip>
      ) : (
        <IconButton
          icon={isCopied ? Check : Copy}
          label="Copy code"
          size="xs"
          variant="ghost"
          onClick={handleCopy}
        />
      );

    const formattingControl =
      prettyPrintedText !== null ? (
        <Tooltip label="Pretty-print JSON">
          {({ getTriggerProps }) => (
            <button
              {...getTriggerProps()}
              type="button"
              aria-label="Pretty-print JSON"
              aria-pressed={format === "pretty"}
              onClick={() => {
                setFormat((previous) =>
                  previous === "pretty" ? "original" : "pretty",
                );
              }}
              className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring aria-pressed:text-primary inline-flex size-6 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-hidden"
            >
              <ListTree className="icon-sm" aria-hidden />
            </button>
          )}
        </Tooltip>
      ) : null;
    const languageControl = (() => {
      if (configuredLanguage !== undefined) {
        if (!showLanguage) return null;
        return (
          <span className="text-muted-foreground inline-flex items-center rounded px-1.5 py-1 text-xs">
            {languageOptions.find((option) => option.value === language)
              ?.label ?? language}
          </span>
        );
      }
      if (isLargePreview) {
        return (
          <span
            className="text-muted-foreground px-1.5 py-1 text-xs"
            title="Syntax highlighting is disabled for previews over 10,000 characters."
          >
            Plain text (large value)
          </span>
        );
      }
      return (
        <SelectDropdown
          aria-label={`${label} language`}
          value={selectedLanguage}
          onValueChange={(language) => {
            if (language === "auto") {
              setSelectedLanguage("auto");
              return;
            }
            setSelectedLanguage(normalizeCodeblockLanguage(language));
          }}
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
      );
    })();
    const toolbar = (() => {
      if (variant === "default") {
        return (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-b px-2 py-1">
            {languageControl}
            {formattingControl}
            {copyButton}
          </div>
        );
      }
      if (variant === "read-only") {
        return (
          <div className="text-muted-foreground absolute top-1.5 right-1.5">
            {copyButton}
          </div>
        );
      }
      return assertUnreachable(variant);
    })();
    const codePadding = (() => {
      if (variant === "read-only") return "0.75rem 2.5rem 0.75rem 0.75rem";
      if (variant === "default") return "0.75rem";
      return assertUnreachable(variant);
    })();

    return (
      <div
        className={cn(
          "codeblock relative flex min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-md font-sans",
          !borderless && "border",
          variant === "read-only" ? "bg-muted" : "bg-muted/30",
        )}
      >
        {toolbar}
        {isLargePreview ||
        language === "text" ||
        (allowFormatting && displayText.length > MAX_HIGHLIGHT_CHARACTERS) ? (
          <pre className="min-h-0 overflow-auto p-3 font-mono text-xs break-all whitespace-pre-wrap">
            {displayText}
          </pre>
        ) : (
          <SyntaxHighlight theme={theme} code={displayText} language={language}>
            {({ className, style, content }) => (
              <pre
                className={cn(
                  className,
                  variant === "default" &&
                    "min-h-0 break-all whitespace-pre-wrap",
                )}
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
  },
);
CodeBlock.displayName = "CodeBlock";

export { CodeBlock as Codeblock };
