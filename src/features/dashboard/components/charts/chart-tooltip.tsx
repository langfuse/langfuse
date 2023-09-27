import React from "react";

export const ChartTooltipFrame = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <div
    className={
      // common
      "rounded-tremor-default text-tremor-default" +
      // light
      "border-tremor-border bg-tremor-background shadow-tremor-dropdown" +
      // dark
      "dark:border-dark-tremor-border dark:bg-dark-tremor-background dark:shadow-dark-tremor-dropdown"
    }
  >
    {children}
  </div>
);

export interface ChartTooltipRowProps {
  value: string;
  name: string;
}

export const ChartTooltipRow = ({
  value,
  name,
  color,
}: ChartTooltipRowProps) => (
  <div className="flex items-center justify-between space-x-8">
    <div className="flex items-center space-x-2">
      <span
        className={
          // common
          "shrink-0 rounded-tremor-full" +
          // light
          "border-tremor-background shadow-tremor-card" +
          // dark
          "dark:border-dark-tremor-background dark:shadow-dark-tremor-card"
        }
      />
      <p
        className={tremorTwMerge(
          // commmon
          "whitespace-nowrap text-right",
          // light
          "text-tremor-content",
          // dark
          "dark:text-dark-tremor-content",
        )}
      >
        {name}
      </p>
    </div>
    <p
      className={tremorTwMerge(
        // common
        "whitespace-nowrap text-right font-medium tabular-nums",
        // light
        "text-tremor-content-emphasis",
        // dark
        "dark:text-dark-tremor-content-emphasis",
      )}
    >
      {value}
    </p>
  </div>
);

export interface ChartTooltipProps {
  active: boolean | undefined;
  payload: any;
  label: string;
  categoryColors: Map<string, Color>;
  valueFormatter: ValueFormatter;
}

const ChartTooltip = ({
  active,
  payload,
  label,
  categoryColors,
  valueFormatter,
}: ChartTooltipProps) => {
  if (active && payload) {
    const filteredPayload = payload.filter((item: any) => item.type !== "none");

    return (
      <ChartTooltipFrame>
        <div
          className={tremorTwMerge(
            // light
            "border-tremor-border",
            // dark
            "dark:border-dark-tremor-border",
            spacing.twoXl.paddingX,
            spacing.sm.paddingY,
            border.sm.bottom,
          )}
        >
          <p
            className={tremorTwMerge(
              // common
              "font-medium",
              // light
              "text-tremor-content-emphasis",
              // dark
              "dark:text-dark-tremor-content-emphasis",
            )}
          >
            {label}
          </p>
        </div>

        <div
          className={tremorTwMerge(
            spacing.twoXl.paddingX,
            spacing.sm.paddingY,
            "space-y-1",
          )}
        >
          {filteredPayload.map(
            ({ value, name }: { value: number; name: string }, idx: number) => (
              <ChartTooltipRow
                key={`id-${idx}`}
                value={valueFormatter(value)}
                name={name}
                color={categoryColors.get(name) ?? BaseColors.Blue}
              />
            ),
          )}
        </div>
      </ChartTooltipFrame>
    );
  }
  return null;
};

export default ChartTooltip;
