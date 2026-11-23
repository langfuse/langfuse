import { useRef, useState, type KeyboardEvent } from "react";
import { type MultiQueryConfig } from "@langfuse/shared";
import { CheckIcon } from "@langfuse/icons";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { PopoverController } from "@/src/components/ui/popover";
import { ChartTypeIllustration } from "@/src/features/widgets/components/ChartTypeIllustration";
import { dashboardWidgetChartTypeIcons } from "@/src/features/widgets/chart-library/chartTypeIcons";
import { cn } from "@/src/utils/tailwind";
const chartOptions = [
  { value: "VERTICAL_BAR", label: "Bar chart" },
  { value: "HORIZONTAL_BAR", label: "Top list" },
  { value: "LINE_TIME_SERIES", label: "Line chart" },
  { value: "AREA_TIME_SERIES", label: "Area chart" },
  { value: "BAR_TIME_SERIES", label: "Bars over time" },
  { value: "PIVOT_TABLE", label: "Table" },
  { value: "PIE", label: "Pie chart" },
  { value: "NUMBER", label: "Big number" },
  { value: "HISTOGRAM", label: "Histogram" },
] satisfies {
  value: MultiQueryConfig["display"]["chartType"];
  label: string;
}[];

export function ChartTypePicker({
  value,
  onValueChange,
  onOpenChartType,
}: {
  value: MultiQueryConfig["display"]["chartType"];
  onValueChange: (value: MultiQueryConfig["display"]["chartType"]) => void;
  onOpenChartType?: () => void;
}) {
  const selectedIndex = Math.max(
    0,
    chartOptions.findIndex((option) => option.value === value),
  );
  const [focusedIndex, setFocusedIndex] = useState(selectedIndex);
  const tiles = useRef<(HTMLButtonElement | null)[]>([]);
  const Icon = dashboardWidgetChartTypeIcons[value];
  const moveFocus = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let next = index;
    const column = index % 3;
    if (event.key === "ArrowLeft") next = column > 0 ? index - 1 : index;
    else if (event.key === "ArrowRight")
      next = column < 2 ? Math.min(index + 1, chartOptions.length - 1) : index;
    else if (event.key === "ArrowUp") next = Math.max(column, index - 3);
    else if (event.key === "ArrowDown")
      next = index + 3 < chartOptions.length ? index + 3 : index;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = chartOptions.length - 1;
    else return;
    event.preventDefault();
    setFocusedIndex(next);
    tiles.current[next]?.focus();
  };
  return (
    <PopoverController
      align="end"
      disabled={false}
      modal={false}
      ariaLabel="Chart type"
      contentClassName="ph-no-capture w-[21rem] min-w-0 max-w-[calc(100vw-1rem)] p-2"
      onOpenChange={(open) => {
        if (!open) return;
        setFocusedIndex(selectedIndex);
        onOpenChartType?.();
      }}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        tiles.current[selectedIndex]?.focus();
      }}
      renderContent={({ closePopover }) => (
        <div
          role="group"
          aria-label="Chart types"
          className="grid min-w-0 grid-cols-3 gap-1"
        >
          {chartOptions.map((option, index) => (
            <button
              key={option.value}
              ref={(element) => {
                tiles.current[index] = element;
              }}
              type="button"
              aria-pressed={value === option.value}
              tabIndex={focusedIndex === index ? 0 : -1}
              onFocus={() => setFocusedIndex(index)}
              onKeyDown={(event) => moveFocus(event, index)}
              onClick={() => {
                if (value !== option.value) onValueChange(option.value);
                closePopover();
              }}
              className={cn(
                "hover:bg-accent/60 focus-visible:ring-ring relative flex min-w-0 flex-col items-center gap-1 rounded-md px-1 py-2 text-center focus-visible:ring-2 focus-visible:outline-hidden",
                value === option.value && "bg-accent",
              )}
            >
              <ChartTypeIllustration
                type={option.value}
                className="h-10 w-16 [--color-primary:hsl(var(--chart-1))] [--primary:var(--chart-1)]"
              />
              <span className="flex min-h-8 items-center justify-center text-xs leading-4 font-medium whitespace-normal">
                {option.label}
              </span>
              {value === option.value ? (
                <span className="absolute top-1 right-1">
                  <CheckIcon size="sm" aria-hidden />
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}
    >
      {({ Trigger }) => (
        <Trigger asChild>
          <button
            type="button"
            aria-label="Chart type"
            className="hover:bg-accent text-foreground-secondary hover:text-foreground focus-visible:ring-ring inline-flex min-h-7 max-w-full items-center gap-1.5 rounded px-1.5 text-left text-sm focus-visible:ring-2 focus-visible:outline-hidden"
          >
            <Icon size="base" aria-hidden />
            <span
              className="min-w-0 truncate"
              title={chartOptions[selectedIndex]!.label}
            >
              {chartOptions[selectedIndex]!.label}
            </span>
            <DropdownIndicator />
          </button>
        </Trigger>
      )}
    </PopoverController>
  );
}
