import { useState } from "react";
import { MUSTACHE_REGEX, isValidVariableName } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { Textarea, type TextareaProps } from "../ui/textarea";
import { useSpielwieseVariableValues } from "./useSpielwieseVariableValues";

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

const mustacheTagChipClassName =
  "relative inline-flex items-center align-middle";
const mustacheTagMeasureClassName = "invisible whitespace-pre";
const mustacheTagSurfaceShellClassName =
  "pointer-events-none absolute inset-0 inline-flex items-center justify-center";
const mustacheTagInnerClassName =
  "inline-flex min-h-[0.9375rem] max-w-full items-center justify-center overflow-hidden rounded-[4px] px-[3px]";
const mustacheTagLabelClassName =
  "overflow-hidden text-ellipsis whitespace-nowrap text-[12px] leading-4 font-medium tracking-[-0.01em]";

const baseMustacheFillOklch = {
  chroma: 0.024493,
  hue: 265.591,
  lightness: 0.948129,
};
const baseMustacheAccentOklch = {
  chroma: 0.175166,
  hue: 261.143,
  lightness: 0.497467,
};
const mustacheHueStep = 47;

function wrapHue(hue: number) {
  return ((hue % 360) + 360) % 360;
}

function getOklchColorString({
  chroma,
  hue,
  lightness,
}: {
  chroma: number;
  hue: number;
  lightness: number;
}) {
  return `oklch(${(lightness * 100).toFixed(3)}% ${chroma.toFixed(6)} ${wrapHue(
    hue,
  ).toFixed(3)})`;
}

function getMustacheTagToneStyles(isValid: boolean, tagIndex: number) {
  if (!isValid) {
    return {
      chip: {
        backgroundColor: "oklch(96.412% 0.014744 17.932)",
        color: "oklch(48.937% 0.194273 20.734)",
        boxShadow: "inset 0 0 0 1px oklch(63.611% 0.184756 20.116)",
      },
    };
  }

  const hueShift = tagIndex * mustacheHueStep;

  return {
    chip: {
      backgroundColor: getOklchColorString({
        ...baseMustacheFillOklch,
        hue: baseMustacheFillOklch.hue + hueShift,
      }),
      color: getOklchColorString({
        ...baseMustacheAccentOklch,
        hue: baseMustacheAccentOklch.hue + hueShift,
      }),
      boxShadow: `inset 0 0 0 1px ${getOklchColorString({
        ...baseMustacheAccentOklch,
        hue: baseMustacheAccentOklch.hue + hueShift,
      })}`,
    },
  };
}

function MustacheTagChip({
  displayValue,
  tagIndex,
  value,
  variableName,
}: {
  displayValue?: string;
  tagIndex: number;
  value: string;
  variableName: string;
}) {
  const toneStyles = getMustacheTagToneStyles(
    isValidVariableName(variableName),
    tagIndex,
  );
  const visibleLabel = displayValue || value || variableName;

  return (
    <span
      className={mustacheTagChipClassName}
      data-prefix="false"
      data-size="20"
      data-suffix="false"
      data-testid={`spielwiese-mustache-tag-${variableName}`}
    >
      <span
        aria-hidden="true"
        className={mustacheTagMeasureClassName}
        data-testid={`spielwiese-mustache-tag-${variableName}-measure`}
      >
        {value}
      </span>
      <span
        className={mustacheTagSurfaceShellClassName}
        data-testid={`spielwiese-mustache-tag-${variableName}-surface-shell`}
      >
        <span
          className={mustacheTagInnerClassName}
          data-size="20"
          data-testid={`spielwiese-mustache-tag-${variableName}-surface`}
          style={toneStyles.chip}
        >
          <span className={mustacheTagLabelClassName}>{visibleLabel}</span>
          <span className="sr-only" />
        </span>
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
      {segments.map((segment) => {
        if (segment.kind === "text") {
          return <span key={segment.key}>{segment.value}</span>;
        }

        const currentTagIndex = tagIndex;
        tagIndex += 1;

        return (
          <MustacheTagChip
            displayValue={variableValues[segment.variableName]}
            key={segment.key}
            tagIndex={currentTagIndex}
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
