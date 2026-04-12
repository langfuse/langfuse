import { useState } from "react";
import { MUSTACHE_REGEX } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { Textarea, type TextareaProps } from "../ui/textarea";
import { useSpielwieseVariableValues } from "./useSpielwieseVariableValues";
import { MustacheTagChip } from "./spielwieseMustacheTagChip";

type SpielwieseMustacheTextareaProps = Omit<
  TextareaProps,
  "onBlur" | "onFocus"
> & {
  liveInline?: boolean;
  onBlur?: React.FocusEventHandler<HTMLTextAreaElement>;
  onFocus?: React.FocusEventHandler<HTMLTextAreaElement>;
};

type MustacheSegment =
  | {
      key: string;
      kind: "text";
      value: string;
    }
  | {
      key: string;
      kind: "tag";
      value: string;
      variableName: string;
    };

function getMustacheSegments(value: string): MustacheSegment[] {
  const segments: MustacheSegment[] = [];
  const mustacheRegex = new RegExp(MUSTACHE_REGEX.source, "g");
  let lastIndex = 0;

  for (const match of value.matchAll(mustacheRegex)) {
    const matchIndex = match.index ?? 0;
    const matchedValue = match[0] ?? "";
    const variableName = match[1] ?? "";

    if (matchIndex > lastIndex) {
      segments.push({
        key: `text-${lastIndex}-${matchIndex}`,
        kind: "text",
        value: value.slice(lastIndex, matchIndex),
      });
    }

    segments.push({
      key: `tag-${matchIndex}-${variableName}`,
      kind: "tag",
      value: matchedValue,
      variableName,
    });
    lastIndex = matchIndex + matchedValue.length;
  }

  if (lastIndex < value.length) {
    segments.push({
      key: `text-${lastIndex}-${value.length}`,
      kind: "text",
      value: value.slice(lastIndex),
    });
  }

  return segments;
}

function MustacheOverlay({
  className,
  segments,
}: {
  className?: string;
  segments: MustacheSegment[];
}) {
  const variableValues = useSpielwieseVariableValues();
  let tagIndex = 0;

  return (
    <div
      aria-hidden="true"
      className={cn(
        className,
        "pointer-events-none absolute inset-0 break-words whitespace-pre-wrap",
      )}
      data-testid="spielwiese-mustache-overlay"
    >
      {/* TODO: Temporary note: the hover tooltip path is wired below, but it still does not work reliably in this overlay stack. */}
      {segments.map((segment) => {
        if (segment.kind === "text") {
          return <span key={segment.key}>{segment.value}</span>;
        }

        const currentTagIndex = tagIndex;
        tagIndex += 1;

        return (
          <MustacheTagChip
            key={segment.key}
            tagIndex={currentTagIndex}
            tooltipValue={variableValues[segment.variableName]}
            value={segment.value}
            variableName={segment.variableName}
          />
        );
      })}
    </div>
  );
}

export function SpielwieseMustacheTextarea({
  className,
  liveInline = false,
  onBlur,
  onFocus,
  value,
  ...props
}: SpielwieseMustacheTextareaProps) {
  const [isEditing, setIsEditing] = useState(false);
  const textValue = typeof value === "string" ? value : String(value ?? "");
  const segments = getMustacheSegments(textValue);
  const hasMustacheTag = segments.some((segment) => segment.kind === "tag");
  const shouldRenderMustacheOverlay =
    hasMustacheTag && (liveInline || !isEditing);
  const shouldHideTextareaText = hasMustacheTag && (liveInline || !isEditing);
  const textareaClassName = cn(
    className,
    shouldHideTextareaText &&
      "relative z-10 text-transparent selection:text-transparent caret-[#202427]",
  );

  return (
    <div
      className="relative w-full min-w-0 overflow-hidden rounded-[10px]"
      data-testid="spielwiese-mustache-root"
    >
      {shouldRenderMustacheOverlay ? (
        <MustacheOverlay className={className} segments={segments} />
      ) : null}
      <Textarea
        className={textareaClassName}
        onBlur={(event) => {
          setIsEditing(false);
          onBlur?.(event);
        }}
        onFocus={(event) => {
          setIsEditing(true);
          onFocus?.(event);
        }}
        value={value}
        {...props}
      />
    </div>
  );
}
