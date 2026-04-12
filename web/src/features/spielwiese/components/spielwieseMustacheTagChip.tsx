import { useState, type CSSProperties, type MouseEvent } from "react";
import { isValidVariableName } from "@langfuse/shared";
import { createPortal } from "react-dom";
import { cn } from "@/src/utils/tailwind";

const mustacheTagChipClassName =
  "relative inline-flex items-center align-middle";
const mustacheTagMeasureClassName = "invisible whitespace-pre";
const mustacheTagSurfaceShellClassName =
  "pointer-events-none absolute inset-0 inline-flex items-center justify-center";
const mustacheTagInnerClassName =
  "inline-flex min-h-[0.9375rem] max-w-full items-center justify-center overflow-hidden rounded-[4px] px-[3px]";
const mustacheTagLabelClassName =
  "overflow-hidden text-ellipsis whitespace-nowrap text-[12px] leading-4 font-medium tracking-[-0.01em]";
const mustacheTagTooltipClassName =
  "pointer-events-none fixed left-[var(--spielwiese-mustache-tooltip-left)] top-[var(--spielwiese-mustache-tooltip-top)] z-[80] w-max max-w-[14rem] -translate-x-1/2 -translate-y-2 rounded-[10px] bg-[rgba(255,255,255,0.98)] px-2.5 py-1.5 text-[0.6875rem] leading-[1.05rem] font-medium whitespace-pre-wrap break-words text-[#202427] shadow-[0_16px_40px_rgba(15,23,42,0.12),0_4px_14px_rgba(15,23,42,0.06)] backdrop-blur-sm";

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

function getMustacheTooltipPosition(target: HTMLElement) {
  const targetRect = target.getBoundingClientRect();
  return {
    left: targetRect.left + targetRect.width / 2,
    top: targetRect.top,
  };
}

function getMustacheTooltipStyle(tooltipPosition: {
  left: number;
  top: number;
}) {
  return {
    "--spielwiese-mustache-tooltip-left": `${tooltipPosition.left}px`,
    "--spielwiese-mustache-tooltip-top": `${tooltipPosition.top}px`,
  } as CSSProperties;
}

function MustacheTagTooltip({
  tooltipPosition,
  tooltipValue,
  variableName,
}: {
  tooltipPosition: {
    left: number;
    top: number;
  };
  tooltipValue: string;
  variableName: string;
}) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className={mustacheTagTooltipClassName}
      data-testid={`spielwiese-mustache-tag-${variableName}-tooltip`}
      role="tooltip"
      style={getMustacheTooltipStyle(tooltipPosition)}
    >
      {tooltipValue}
    </div>,
    document.body,
  );
}

function MustacheTagSurface({
  toneStyles,
  value,
  variableName,
}: {
  toneStyles: ReturnType<typeof getMustacheTagToneStyles>;
  value: string;
  variableName: string;
}) {
  return (
    <>
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
          <span className={mustacheTagLabelClassName}>{value}</span>
          <span className="sr-only" />
        </span>
      </span>
    </>
  );
}

export function MustacheTagChip({
  tagIndex,
  tooltipValue,
  value,
  variableName,
}: {
  tagIndex: number;
  tooltipValue?: string;
  value: string;
  variableName: string;
}) {
  const [tooltipPosition, setTooltipPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const toneStyles = getMustacheTagToneStyles(
    isValidVariableName(variableName),
    tagIndex,
  );
  const hasTooltipValue = Boolean(tooltipValue?.trim());

  function openTooltip(event: MouseEvent<HTMLSpanElement>) {
    if (!hasTooltipValue) {
      return;
    }
    setTooltipPosition(getMustacheTooltipPosition(event.currentTarget));
  }

  return (
    <span
      className={cn(
        mustacheTagChipClassName,
        hasTooltipValue && "pointer-events-auto",
      )}
      data-prefix="false"
      data-size="20"
      data-suffix="false"
      data-testid={`spielwiese-mustache-tag-${variableName}`}
      // TODO: Temporary note: this hover-triggered tooltip still does not work reliably in the detached-user textarea.
      onMouseDown={(event) => {
        if (hasTooltipValue) {
          event.preventDefault();
        }
      }}
      onMouseEnter={openTooltip}
      onMouseLeave={() => setTooltipPosition(null)}
      onMouseMove={openTooltip}
    >
      <MustacheTagSurface
        toneStyles={toneStyles}
        value={value}
        variableName={variableName}
      />
      {hasTooltipValue && tooltipPosition && tooltipValue ? (
        <MustacheTagTooltip
          tooltipPosition={tooltipPosition}
          tooltipValue={tooltipValue}
          variableName={variableName}
        />
      ) : null}
    </span>
  );
}
