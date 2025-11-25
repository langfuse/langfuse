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
    <div className="rounded-md border border-border bg-background opacity-100 shadow-lg">
      <div className={cn("border-b border-border px-3 py-1.5")}>
        <p className={cn("text-sm font-medium text-muted-foreground")}>
          {label}
        </p>
      </div>

      <div className={cn("space-y-1 px-3 py-1.5")}>
        {sortedPayload.map(({ name, value, color }, index) => (
          <div key={`${index}`} className="flex items-center gap-2">
            <div
              className="h-3 w-3 flex-shrink-0 rounded-sm"
              style={{ backgroundColor: color ?? getRandomColor() }}
            />
            <span className="flex-1 text-sm text-muted-foreground">
              {name?.toString() ?? ""}
            </span>
            <span className="text-sm font-medium text-muted-foreground">
              {formatter(Number(value))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
