import { useState, type ReactNode } from "react";
import { cn } from "@/src/utils/tailwind";
import { Textarea } from "../ui/textarea";
import { SpielwieseMessageInsertRow } from "./SpielwieseMessageInsertRow";
import { SpielwieseResponseFormatRow } from "./SpielwieseResponseFormatControls";

const spielwieseJsonFormatFooterClassName = "bg-[#F1F2F2]";
const spielwieseJsonFormatEditorShellClassName =
  "overflow-hidden rounded-none border-0 border-t border-[rgba(0,0,0,0.05)] bg-[#F1F2F2]";
const spielwieseJsonFormatHighlightClassName =
  "m-0 min-h-[4.5rem] whitespace-pre-wrap break-words px-2 py-1.5 font-mono text-[0.6875rem] leading-[1.05rem] text-[#202427]";
const spielwieseJsonFormatTextareaClassName =
  "relative z-[1] min-h-[4.5rem] w-full resize-none overflow-auto rounded-none border-0 bg-transparent px-2 py-1.5 font-mono text-[0.6875rem] leading-[1.05rem] text-transparent caret-[#202427] shadow-none outline-none selection:bg-[rgba(72,123,164,0.16)] focus-visible:border-transparent focus-visible:ring-0";
const spielwieseJsonFormatPlaceholder = `{
  "field": "value"
}`;
const jsonTokenPattern =
  /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b|[{}[\],:]/g;

type JsonTokenKind = "boolean" | "key" | "number" | "punctuation" | "string";
type ResponseFormatMode = "json" | "none";

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
          aria-label={`${nodeId} ${sectionLabel} Response Format JSON`}
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

function SpielwieseResponseFormatInsertRow({
  nodeId,
  onPromptSectionInsert,
}: {
  nodeId: string;
  onPromptSectionInsert: (
    nodeId: string,
    kind: "user" | "system" | "assistant" | "tool",
  ) => void;
}) {
  return (
    <SpielwieseMessageInsertRow
      className="pl-0"
      controlIdBase={`${nodeId}-response-format-message-insert`}
      nodeId={nodeId}
      onPromptSectionInsert={onPromptSectionInsert}
      rowTestId="spielwiese-response-format-insert-row"
      testIdBase="spielwiese-response-format-insert"
      triggerContent="+ New agent message"
      variant="text"
    />
  );
}

function applyResponseFormatSelection(
  mode: ResponseFormatMode,
  setIsOpen: (value: boolean) => void,
  setResponseFormat: (value: ResponseFormatMode) => void,
) {
  setResponseFormat(mode);
  setIsOpen(mode === "json");
}

export function SpielwieseJsonFormatComposer({
  className,
  nodeId,
  onPromptSectionInsert,
  sectionLabel,
}: {
  className?: string;
  nodeId: string;
  onPromptSectionInsert: (
    nodeId: string,
    kind: "user" | "system" | "assistant" | "tool",
  ) => void;
  sectionLabel: string;
}) {
  const [responseFormat, setResponseFormat] =
    useState<ResponseFormatMode>("none");
  const [isOpen, setIsOpen] = useState(false);
  const [formatValue, setFormatValue] = useState("");
  const isJsonFormat = responseFormat === "json";
  const handleChooseNone = () =>
    applyResponseFormatSelection("none", setIsOpen, setResponseFormat);
  const handleChooseJson = () =>
    applyResponseFormatSelection("json", setIsOpen, setResponseFormat);

  return (
    <div
      className={cn(
        spielwieseJsonFormatFooterClassName,
        "overflow-hidden rounded-b-[calc(var(--node-shell-radius)-var(--node-shell-gap))] px-0 pt-0 pb-0",
        className,
      )}
      data-testid="spielwiese-response-format-composer"
    >
      <SpielwieseResponseFormatRow
        isJsonFormat={isJsonFormat}
        isOpen={isOpen}
        leadingAccessory={
          <SpielwieseResponseFormatInsertRow
            nodeId={nodeId}
            onPromptSectionInsert={onPromptSectionInsert}
          />
        }
        nodeId={nodeId}
        onChooseJson={handleChooseJson}
        onChooseNone={handleChooseNone}
        onToggleOpen={() => setIsOpen((currentValue) => !currentValue)}
      />
      {isJsonFormat && isOpen ? (
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
