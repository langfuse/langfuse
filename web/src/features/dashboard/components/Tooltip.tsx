import {
  ChartTooltipFrame,
  ChartTooltipRow,
} from "@tremor/react/dist/components/chart-elements/common/ChartTooltip";
import { cn } from "@/src/utils/tailwind";
import { type CustomTooltipProps } from "@tremor/react";
import { getRandomColor } from "@/src/features/dashboard/utils/getColorsForCategories";

export const Tooltip = ({
  payload,
  active,
  label,
  formatter,
}: CustomTooltipProps & { formatter: (value: number) => string }) => {
  if (!active || !payload) return null;

  // Filter out duplicates and sort by value in descending order
  const uniquePayload = Array.from(
    new Map(payload.map((category) => [category.name, category])).values(),
  );

  const sortedPayload = uniquePayload.sort(
    (a, b) => (Number(b.value) ?? 0) - (Number(a.value) ?? 0),
  );

  return (
    <ChartTooltipFrame>
      <div
        className={cn(
          // light
          "border-b border-tremor-border px-4 py-2",
          // dark
          "dark:border-dark-tremor-border",
        )}
      >
        <p
          className={cn(
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

      <div className={cn("space-y-1 px-4 py-2")}>
        {sortedPayload.map(({ name, value, color }, index) => (
          <ChartTooltipRow
            key={`${index}`}
            value={formatter(Number(value))}
            name={name?.toString() ?? ""}
            color={color ?? getRandomColor()}
          />
        ))}
      </div>
    </ChartTooltipFrame>
  );
};
