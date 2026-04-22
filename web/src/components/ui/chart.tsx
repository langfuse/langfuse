"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";
import type {
  TooltipContentProps,
  TooltipPayloadEntry,
  TooltipValueType,
} from "recharts";

import { cn } from "@/src/utils/tailwind";

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: "", dark: ".dark" } as const;

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  );
};

type ChartContextProps = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }

  return context;
}

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    config: ChartConfig;
    children: React.ComponentProps<
      typeof RechartsPrimitive.ResponsiveContainer
    >["children"];
  }
>(({ id, className, children, config, ...props }, ref) => {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        ref={ref}
        className={cn(
          "[&_.recharts-cartesian-axis-tick-value]:fill-muted-foreground/90 [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground/90 [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border relative h-full w-full flex-1 justify-center text-xs [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          minHeight={1}
          initialDimension={{ width: 1, height: 1 }}
        >
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
});
ChartContainer.displayName = "Chart";

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(
    ([, config]) => config.theme || config.color,
  );

  if (!colorConfig.length) {
    return null;
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color =
      itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ||
      itemConfig.color;
    const safeKey = key.replace(/[^\p{L}\p{N}_ .()-]/gu, "_");
    return color ? `  --color-${safeKey}: ${color};` : null;
  })
  .join("\n")}
}
`,
          )
          .join("\n"),
      }}
    />
  );
};

type ChartTooltipProps = React.ComponentProps<typeof RechartsPrimitive.Tooltip>;

function ChartTooltip({
  allowEscapeViewBox = { x: false, y: false },
  isAnimationActive = false,
  offset = 12,
  useTranslate3d = true,
  wrapperStyle,
  ...props
}: ChartTooltipProps) {
  return (
    <RechartsPrimitive.Tooltip
      allowEscapeViewBox={allowEscapeViewBox}
      isAnimationActive={isAnimationActive}
      offset={offset}
      useTranslate3d={useTranslate3d}
      wrapperStyle={{
        pointerEvents: "none",
        zIndex: 50,
        ...wrapperStyle,
      }}
      {...props}
    />
  );
}

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> &
    Partial<TooltipContentProps<TooltipValueType, string | number>> & {
      hideLabel?: boolean;
      hideIndicator?: boolean;
      indicator?: "line" | "dot" | "dashed";
      nameKey?: string;
      labelKey?: string;
      valueFormatter?: (value: number) => string;
      nameFormatter?: (name: string) => string;
      sortPayloadByValue?: "asc" | "desc";
    }
>(
  (
    {
      active,
      payload,
      className,
      indicator = "dot",
      hideLabel = false,
      hideIndicator = false,
      label,
      labelFormatter,
      labelClassName,
      formatter,
      color,
      nameKey,
      labelKey,
      valueFormatter,
      nameFormatter,
      sortPayloadByValue,
    },
    ref,
  ) => {
    const { config } = useChart();

    const displayPayload = React.useMemo(() => {
      if (!payload?.length || !sortPayloadByValue) return payload ?? [];
      return [...payload].sort((a, b) => {
        const va = Number(a.value ?? 0);
        const vb = Number(b.value ?? 0);
        return sortPayloadByValue === "desc" ? vb - va : va - vb;
      });
    }, [payload, sortPayloadByValue]);

    const tooltipLabel = React.useMemo(() => {
      if (hideLabel || !payload?.length) {
        return null;
      }

      const [item] = payload;
      const key = `${labelKey || item?.dataKey || item?.name || "value"}`;
      const itemConfig = getPayloadConfigFromPayload(config, item, key);
      const value =
        !labelKey && typeof label === "string"
          ? config[label as keyof typeof config]?.label || label
          : itemConfig?.label;

      if (labelFormatter) {
        return (
          <div className={cn("font-medium", labelClassName)}>
            {labelFormatter(value, payload)}
          </div>
        );
      }

      if (!value) {
        return null;
      }

      return <div className={cn("font-medium", labelClassName)}>{value}</div>;
    }, [
      label,
      labelFormatter,
      payload,
      hideLabel,
      labelClassName,
      config,
      labelKey,
    ]);

    if (!active || !payload?.length) {
      return null;
    }

    const nestLabel = displayPayload.length === 1 && indicator !== "dot";

    return (
      <div
        ref={ref}
        className={cn(
          "border-border/50 bg-background grid min-w-32 items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl",
          className,
        )}
      >
        {!nestLabel ? tooltipLabel : null}
        <div className="grid gap-1.5">
          {displayPayload.map((item, index) => {
            const key = `${nameKey || item.name || item.dataKey || "value"}`;
            const itemConfig = getPayloadConfigFromPayload(config, item, key);
            const indicatorColor =
              color ||
              getFillColor(item.payload) ||
              item.color ||
              "currentColor";

            return (
              <div
                key={String(item.dataKey ?? item.name ?? index)}
                className={cn(
                  "[&>svg]:text-muted-foreground flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5",
                  indicator === "dot" && "items-center",
                )}
              >
                {formatter && item?.value !== undefined && item.name != null ? (
                  formatter(item.value, item.name, item, index, displayPayload)
                ) : (
                  <>
                    {itemConfig?.icon ? (
                      <itemConfig.icon />
                    ) : (
                      !hideIndicator && (
                        <div
                          className={cn(
                            "border-border shrink-0 rounded-[2px] bg-(--color-bg)",
                            {
                              "h-2.5 w-2.5": indicator === "dot",
                              "w-1": indicator === "line",
                              "w-0 border-[1.5px] border-dashed bg-transparent":
                                indicator === "dashed",
                              "my-0.5": nestLabel && indicator === "dashed",
                            },
                          )}
                          style={
                            {
                              "--color-bg": indicatorColor,
                              "--color-border": indicatorColor,
                            } as React.CSSProperties
                          }
                        />
                      )
                    )}
                    <div
                      className={cn(
                        "flex flex-1 justify-between leading-none",
                        nestLabel ? "items-end" : "items-center",
                      )}
                    >
                      <div className="grid gap-1.5">
                        {nestLabel ? tooltipLabel : null}
                        <span className="text-muted-foreground">
                          {nameFormatter
                            ? nameFormatter(
                                String(item.name ?? item.dataKey ?? ""),
                              )
                            : itemConfig?.label || item.name}
                        </span>
                      </div>
                      {item.value !== undefined && item.value !== null && (
                        <span className="text-foreground font-mono font-medium tabular-nums">
                          {valueFormatter
                            ? valueFormatter(Number(item.value))
                            : item.value.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);
ChartTooltipContent.displayName = "ChartTooltip";

type ChartLegendProps = React.ComponentProps<typeof RechartsPrimitive.Legend>;

function ChartLegend({ itemSorter = null, ...props }: ChartLegendProps) {
  return <RechartsPrimitive.Legend itemSorter={itemSorter} {...props} />;
}

function ChartActiveReferenceLine({
  stroke = "hsl(var(--border))",
  strokeDasharray = "4 4",
  strokeOpacity = 0.8,
  zIndex = 350,
}: {
  stroke?: string;
  strokeDasharray?: string;
  strokeOpacity?: number;
  zIndex?: number;
}) {
  const activeLabel = RechartsPrimitive.useActiveTooltipLabel();
  const isTooltipActive = RechartsPrimitive.useIsTooltipActive();

  if (!isTooltipActive || activeLabel === undefined || activeLabel === null) {
    return null;
  }

  return (
    <RechartsPrimitive.ReferenceLine
      x={activeLabel}
      stroke={stroke}
      strokeDasharray={strokeDasharray}
      strokeOpacity={strokeOpacity}
      ifOverflow="extendDomain"
      zIndex={zIndex}
    />
  );
}

// Helper to extract item config from a payload.
function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string,
) {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const payloadPayload =
    "payload" in payload &&
    typeof payload.payload === "object" &&
    payload.payload !== null
      ? payload.payload
      : undefined;

  let configLabelKey: string = key;

  if (
    key in payload &&
    typeof payload[key as keyof typeof payload] === "string"
  ) {
    configLabelKey = payload[key as keyof typeof payload] as string;
  } else if (
    payloadPayload &&
    key in payloadPayload &&
    typeof payloadPayload[key as keyof typeof payloadPayload] === "string"
  ) {
    configLabelKey = payloadPayload[
      key as keyof typeof payloadPayload
    ] as string;
  }

  return configLabelKey in config
    ? config[configLabelKey]
    : config[key as keyof typeof config];
}

function getFillColor(
  payload: TooltipPayloadEntry<TooltipValueType, string | number>["payload"],
): string | undefined {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "fill" in payload &&
    typeof payload.fill === "string"
  ) {
    return payload.fill;
  }

  return undefined;
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartActiveReferenceLine,
  useChart,
  getPayloadConfigFromPayload,
};
