import { format, subMonths } from "date-fns";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { cn } from "@/src/utils/tailwind";

export type EvaluatorBackfillWindow =
  | "24-hours"
  | "7-days"
  | "30-days"
  | "90-days"
  | "custom";

export type EvaluatorBackfillRange = {
  from: Date;
  to: Date;
};

const windowOptions: Array<{
  value: EvaluatorBackfillWindow;
  label: string;
}> = [
  { value: "24-hours", label: "24 hours" },
  { value: "7-days", label: "7 days" },
  { value: "30-days", label: "30 days" },
  { value: "90-days", label: "90 days" },
  { value: "custom", label: "Custom..." },
];

export function EvaluatorBackfillSettings({
  enabled,
  canEnable,
  selectedWindow,
  range,
  maxItems,
  maxAllowedItems,
  matchingObservations,
  isEstimating,
  onEnabledChange,
  onWindowChange,
  onRangeChange,
  onMaxItemsChange,
}: {
  enabled: boolean;
  canEnable: boolean;
  selectedWindow: EvaluatorBackfillWindow;
  range: EvaluatorBackfillRange;
  maxItems: number;
  maxAllowedItems: number;
  matchingObservations: number;
  isEstimating: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onWindowChange: (window: EvaluatorBackfillWindow) => void;
  onRangeChange: (range: EvaluatorBackfillRange) => void;
  onMaxItemsChange: (maxItems: number) => void;
}) {
  const cappedCount = Math.min(matchingObservations, maxItems);
  const rangeDays = Math.max(
    1,
    Math.ceil(
      (range.to.getTime() - range.from.getTime()) / (24 * 60 * 60 * 1_000),
    ),
  );

  return (
    <section className="mt-3 ml-6 border-t pt-3">
      <div className="flex items-start gap-2">
        <Switch
          id="evaluator-backfill-enabled"
          size="sm"
          checked={enabled}
          disabled={!canEnable}
          onCheckedChange={onEnabledChange}
        />
        <div>
          <label
            htmlFor="evaluator-backfill-enabled"
            className={cn(
              "block text-sm leading-none font-bold",
              canEnable ? "cursor-pointer" : "text-muted-foreground",
            )}
          >
            Also apply these filters to past observations
          </label>
          <p className="text-muted-foreground mt-1.5 text-xs">
            A one-time backfill over observations you already have.
          </p>
        </div>
      </div>

      {enabled ? (
        <div className="mt-3 space-y-3 rounded-md border p-3">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-24 shrink-0 text-xs">
              Time window
            </span>
            <div className="flex flex-wrap gap-1.5">
              {windowOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={
                    selectedWindow === option.value ? "default" : "outline"
                  }
                  className="h-7 rounded-full px-3 text-xs"
                  onClick={() => onWindowChange(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {selectedWindow === "custom" ? (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-24 shrink-0 text-xs">
                From → to
              </span>
              <Input
                aria-label="Backfill start date"
                type="date"
                className="w-36"
                value={format(range.from, "yyyy-MM-dd")}
                min={format(subMonths(new Date(), 6), "yyyy-MM-dd")}
                max={format(range.to, "yyyy-MM-dd")}
                onChange={(event) => {
                  if (!event.target.value) return;
                  onRangeChange({
                    ...range,
                    from: new Date(`${event.target.value}T00:00:00`),
                  });
                }}
              />
              <span className="text-muted-foreground">→</span>
              <Input
                aria-label="Backfill end date"
                type="date"
                className="w-36"
                value={format(range.to, "yyyy-MM-dd")}
                min={format(range.from, "yyyy-MM-dd")}
                max={format(new Date(), "yyyy-MM-dd")}
                onChange={(event) => {
                  if (!event.target.value) return;
                  onRangeChange({
                    ...range,
                    to: new Date(`${event.target.value}T23:59:59.999`),
                  });
                }}
              />
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <label
              htmlFor="evaluator-backfill-max-items"
              className="text-muted-foreground w-24 shrink-0 text-xs"
            >
              Max items
            </label>
            <Input
              id="evaluator-backfill-max-items"
              type="number"
              min={1}
              max={maxAllowedItems}
              className="w-28 text-right font-mono"
              value={maxItems}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (!Number.isFinite(value)) return;
                onMaxItemsChange(
                  Math.min(maxAllowedItems, Math.max(1, Math.floor(value))),
                );
              }}
            />
            <span className="text-muted-foreground text-xs">
              {compactNumberFormatter(maxAllowedItems, 0)} max per backfill
            </span>
          </div>

          <p className="bg-muted/40 rounded px-3 py-2 text-xs">
            {isEstimating
              ? "Counting matching observations..."
              : matchingObservations > maxItems
                ? `${compactNumberFormatter(matchingObservations, 1)} observations in the selected range (${rangeDays} days) — capping at ${compactNumberFormatter(cappedCount, 1)}, newest first.`
                : `${compactNumberFormatter(matchingObservations, 1)} observations in the selected range (${rangeDays} days), all within your limit.`}
          </p>
        </div>
      ) : null}
    </section>
  );
}
