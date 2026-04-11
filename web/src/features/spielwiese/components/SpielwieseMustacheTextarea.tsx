import { MUSTACHE_REGEX, isValidVariableName } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { Textarea, type TextareaProps } from "../ui/textarea";

type SpielwieseMustacheTextareaProps = TextareaProps;

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

function getMustacheTagToneClassName(isValid: boolean) {
  return isValid
    ? "border-[rgba(0,0,0,0.08)] bg-[rgba(234,238,240,0.96)] text-[rgba(28,34,38,0.78)]"
    : "border-[rgba(145,28,28,0.16)] bg-[rgba(208,58,58,0.09)] text-[rgba(130,24,24,0.76)]";
}

function MustacheTagChip({
  value,
  variableName,
}: {
  value: string;
  variableName: string;
}) {
  return (
    <span
      className="inline-flex align-baseline"
      data-prefix="false"
      data-size="20"
      data-suffix="false"
      data-testid={`spielwiese-mustache-tag-${variableName}`}
    >
      <span
        className={cn(
          "inline-flex min-h-5 items-center rounded-[6px] border px-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]",
          getMustacheTagToneClassName(isValidVariableName(variableName)),
        )}
        data-size="20"
      >
        <span className="font-medium tracking-[-0.01em]">{value}</span>
        <span className="sr-only" />
      </span>
    </span>
  );
}

function MustacheOverlay({
  className,
  segments,
}: {
  className?: string;
  segments: MustacheSegment[];
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        className,
        "pointer-events-none absolute inset-0 break-words whitespace-pre-wrap",
      )}
      data-testid="spielwiese-mustache-overlay"
    >
      {segments.map((segment) =>
        segment.kind === "text" ? (
          <span key={segment.key}>{segment.value}</span>
        ) : (
          <MustacheTagChip
            key={segment.key}
            value={segment.value}
            variableName={segment.variableName}
          />
        ),
      )}
    </div>
  );
}

export function SpielwieseMustacheTextarea({
  className,
  value,
  ...props
}: SpielwieseMustacheTextareaProps) {
  const textValue = typeof value === "string" ? value : String(value ?? "");
  const segments = getMustacheSegments(textValue);
  const hasMustacheTag = segments.some((segment) => segment.kind === "tag");
  const textareaClassName = cn(
    className,
    hasMustacheTag &&
      "relative z-10 text-transparent caret-current selection:text-transparent",
  );

  return (
    <div className="relative w-full min-w-0">
      {hasMustacheTag ? (
        <MustacheOverlay className={className} segments={segments} />
      ) : null}
      <Textarea className={textareaClassName} value={value} {...props} />
    </div>
  );
}
