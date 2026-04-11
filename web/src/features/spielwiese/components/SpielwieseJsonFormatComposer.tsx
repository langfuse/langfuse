import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Textarea } from "../ui/textarea";

const spielwieseJsonFormatFooterClassName =
  "border-t border-[rgba(0,0,0,0.05)] bg-[#F1F2F2]";
const spielwieseJsonFormatEditorShellClassName =
  "mt-0.5 overflow-hidden rounded-[7px] border border-[rgba(0,0,0,0.05)] bg-[#F6F7F7]";
const spielwieseJsonFormatHighlightClassName =
  "m-0 min-h-[4.5rem] whitespace-pre-wrap break-words px-2 py-1.5 font-mono text-[0.6875rem] leading-[1.05rem] text-[#202427]";
const spielwieseJsonFormatTextareaClassName =
  "relative z-[1] min-h-[4.5rem] w-full resize-none overflow-auto rounded-[7px] border-0 bg-transparent px-2 py-1.5 font-mono text-[0.6875rem] leading-[1.05rem] text-transparent caret-[#202427] shadow-none outline-none selection:bg-[rgba(72,123,164,0.16)] focus-visible:border-transparent focus-visible:ring-0";
const spielwieseJsonFormatPlaceholder = `{
  "field": "value"
}`;
const jsonTokenPattern =
  /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b|[{}[\],:]/g;

type JsonTokenKind = "boolean" | "key" | "number" | "punctuation" | "string";

function getJsonTokenClassName(kind: JsonTokenKind) {
  if (kind === "key") {
    return "text-[#4F7D99]";
  }

  if (kind === "string") {
    return "text-[#5F7F5B]";
  }

  if (kind === "number") {
    return "text-[#9B6852]";
  }

  if (kind === "boolean") {
    return "text-[#7B6290]";
  }

  return "text-[rgba(32,36,39,0.5)]";
}

function getJsonTokenKind(
  source: string,
  tokenIndex: number,
  tokenValue: string,
) {
  if (tokenValue.startsWith('"')) {
    return /^\s*:/.test(source.slice(tokenIndex + tokenValue.length))
      ? "key"
      : "string";
  }

  if (/^-?\d/.test(tokenValue)) {
    return "number";
  }

  if (
    tokenValue === "true" ||
    tokenValue === "false" ||
    tokenValue === "null"
  ) {
    return "boolean";
  }

  return "punctuation";
}

function renderJsonHighlightTokens(source: string) {
  const highlightedTokens: ReactNode[] = [];
  let cursor = 0;

  for (const tokenMatch of source.matchAll(jsonTokenPattern)) {
    const tokenValue = tokenMatch[0];
    const tokenIndex = tokenMatch.index ?? 0;

    if (tokenIndex > cursor) {
      highlightedTokens.push(source.slice(cursor, tokenIndex));
    }

    const tokenKind = getJsonTokenKind(source, tokenIndex, tokenValue);

    highlightedTokens.push(
      <span
        className={getJsonTokenClassName(tokenKind)}
        data-token-kind={tokenKind}
        key={`${tokenKind}-${tokenIndex}`}
      >
        {tokenValue}
      </span>,
    );
    cursor = tokenIndex + tokenValue.length;
  }

  if (cursor < source.length) {
    highlightedTokens.push(source.slice(cursor));
  }

  return highlightedTokens;
}

function SpielwieseJsonFormatEditor({
  formatValue,
  nodeId,
  sectionLabel,
  setFormatValue,
}: {
  formatValue: string;
  nodeId: string;
  sectionLabel: string;
  setFormatValue: (value: string) => void;
}) {
  const [editorScroll, setEditorScroll] = useState({ left: 0, top: 0 });
  const displayValue = formatValue || spielwieseJsonFormatPlaceholder;

  return (
    <div
      className={spielwieseJsonFormatEditorShellClassName}
      data-testid="spielwiese-json-format-panel"
      id={`${nodeId}-json-format-panel`}
    >
      <div className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <pre
            className={cn(
              spielwieseJsonFormatHighlightClassName,
              formatValue.length === 0 && "opacity-60",
            )}
            data-testid="spielwiese-json-format-highlight"
            style={{
              transform: `translate(${-editorScroll.left}px, ${-editorScroll.top}px)`,
            }}
          >
            {renderJsonHighlightTokens(displayValue)}
          </pre>
        </div>
        <Textarea
          aria-label={`${nodeId} ${sectionLabel} JSON Format`}
          autoCapitalize="off"
          autoCorrect="off"
          className={spielwieseJsonFormatTextareaClassName}
          name={`${nodeId}-json-format`}
          onChange={(event) => setFormatValue(event.target.value)}
          onScroll={(event) =>
            setEditorScroll({
              left: event.currentTarget.scrollLeft,
              top: event.currentTarget.scrollTop,
            })
          }
          rows={4}
          spellCheck={false}
          value={formatValue}
        />
      </div>
    </div>
  );
}

export function SpielwieseJsonFormatComposer({
  nodeId,
  sectionLabel,
}: {
  nodeId: string;
  sectionLabel: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [formatValue, setFormatValue] = useState("");

  return (
    <div
      className={cn(spielwieseJsonFormatFooterClassName, "px-1.5 pt-1 pb-1")}
    >
      <button
        aria-controls={`${nodeId}-json-format-panel`}
        aria-expanded={isOpen}
        aria-label="JSON Format"
        className="text-foreground/50 hover:text-foreground/68 inline-flex h-5 w-full items-center justify-between rounded-[5px] px-1 text-left text-[0.6875rem] font-medium tracking-[0.01em] transition-colors outline-none focus-visible:ring-0"
        type="button"
        onClick={() => setIsOpen((currentValue) => !currentValue)}
      >
        <span>JSON Format</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-3 shrink-0 transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>
      {isOpen ? (
        <SpielwieseJsonFormatEditor
          formatValue={formatValue}
          nodeId={nodeId}
          sectionLabel={sectionLabel}
          setFormatValue={setFormatValue}
        />
      ) : null}
    </div>
  );
}
