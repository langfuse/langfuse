import React, { useLayoutEffect, useRef, useState, useMemo } from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/src/utils/tailwind";
import { type MetricFormatterFunction } from "./chart-props";
import { type BigNumberPresentation } from "./prepareBigNumber";

const bigNumberVariants = cva(
  "flex h-full w-full flex-col items-center justify-center rounded-md",
  {
    variants: {
      color: {
        green:
          "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300",
        amber:
          "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
        red: "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300",
      },
    },
  },
);

// This should ideally be read based on the actual font sizes defined in Tailwind
const baseFontSizeLookup = {
  "text-8xl": 128,
  "text-7xl": 96,
  "text-6xl": 72,
  "text-5xl": 60,
  "text-4xl": 48,
  "text-3xl": 36,
  "text-2xl": 24,
  "text-xl": 20,
  "text-lg": 18,
  "text-base": 16,
  "text-sm": 14,
} as const;

type FontSizeClass = keyof typeof baseFontSizeLookup;

const baseFontSizes = Object.entries(baseFontSizeLookup)
  .sort(([, leftPx], [, rightPx]) => rightPx - leftPx)
  .map(([fontClass, px]) => ({ class: fontClass as FontSizeClass, px }));

const affixFontSizeLookup: Record<FontSizeClass, string> = {
  "text-8xl": "text-4xl",
  "text-7xl": "text-3xl",
  "text-6xl": "text-2xl",
  "text-5xl": "text-xl",
  "text-4xl": "text-lg",
  "text-3xl": "text-base",
  "text-2xl": "text-sm",
  "text-xl": "text-sm",
  "text-lg": "text-xs",
  "text-base": "text-xs",
  "text-sm": "text-xs",
};

const getAffixFontSize = (size: FontSizeClass) => {
  return affixFontSizeLookup[size];
};

export const BigNumber = ({
  presentation,
  metricFormatter,
}: {
  presentation: BigNumberPresentation;
  metricFormatter?: MetricFormatterFunction;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState<FontSizeClass>("text-6xl");
  const [maxCharacters, setMaxCharacters] = useState<number>();

  const calculatedMetric = presentation.value;
  const status = presentation.status;
  const hasStatus = status !== null;

  const displayValue = useMemo(() => {
    return metricFormatter
      ? metricFormatter(
          calculatedMetric,
          maxCharacters
            ? {
                style: "compact",
                maxCharacters,
              }
            : { style: "compact" },
        )
      : {
          main: calculatedMetric.toString(),
        };
  }, [calculatedMetric, maxCharacters, metricFormatter]);

  // Fits before the first paint so the number never renders at the default size and shrinks.
  useLayoutEffect(() => {
    const fit = () => {
      if (!containerRef.current || !textRef.current) return;

      const container = containerRef.current;

      // Get container dimensions
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const availableWidth = containerWidth * 0.95; // Use more width (was 0.9)
      const availableHeight = containerHeight * 0.9 - (hasStatus ? 28 : 0);

      // Start with a large font size and scale down
      let selectedFontSize: FontSizeClass = "text-sm";
      let calculatedMaxChars = 0;

      // Test each font size to find the largest that fits
      for (const { class: fontClass, px } of baseFontSizes) {
        // Estimate how many characters can fit - less conservative character width
        const charWidth = px * 0.55; // Less conservative (was 0.6)
        const maxChars = Math.floor(availableWidth / charWidth);

        // Quick test with current display value
        const testDisplayValue = metricFormatter
          ? metricFormatter(calculatedMetric, {
              style: "compact",
              maxCharacters: maxChars,
            })
          : { main: "0" };

        const textLength = (
          (testDisplayValue.negative ? "-" : "") +
          (testDisplayValue.prefix ?? "") +
          testDisplayValue.main +
          (testDisplayValue.suffix ?? "")
        ).length;
        const estimatedWidth = textLength * charWidth;
        const estimatedHeight = px * 1.1; // Less conservative line height (was 1.2)

        if (
          estimatedWidth <= availableWidth &&
          estimatedHeight <= availableHeight
        ) {
          selectedFontSize = fontClass;
          calculatedMaxChars = maxChars;
          break;
        }
      }

      setFontSize(selectedFontSize);
      setMaxCharacters(calculatedMaxChars);
    };

    fit();
    const resizeObserver = new ResizeObserver(fit);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [calculatedMetric, metricFormatter, hasStatus]);

  return (
    <div className="ph-no-capture h-full w-full">
      <div
        ref={containerRef}
        className={bigNumberVariants({ color: status?.color })}
      >
        <div className="flex items-baseline justify-center gap-1">
          {displayValue.prefix && (
            <span
              className={cn(
                "text-muted-foreground font-bold",
                getAffixFontSize(fontSize),
              )}
            >
              {displayValue.negative && (
                <span
                  className={cn(
                    "text-foreground font-bold tracking-tight",
                    fontSize,
                  )}
                >
                  -
                </span>
              )}
              {displayValue.prefix}
            </span>
          )}
          <span
            ref={textRef}
            className={cn("text-center font-bold tracking-tight", fontSize)}
            title={calculatedMetric.toString()}
          >
            {displayValue.negative && !displayValue.prefix ? "-" : ""}
            {displayValue.main}
          </span>
          {displayValue.suffix && (
            <span
              className={cn(
                "text-muted-foreground font-bold",
                getAffixFontSize(fontSize),
              )}
            >
              {displayValue.suffix}
            </span>
          )}
        </div>
        {status && (
          <span className="mt-2 text-sm font-bold">{status.label}</span>
        )}
      </div>
    </div>
  );
};
