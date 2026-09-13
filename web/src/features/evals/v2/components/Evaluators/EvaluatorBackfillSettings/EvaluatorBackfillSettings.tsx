import { format, subMonths } from "date-fns";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { DateRangeInput } from "@/src/features/evals/v2/components/Evaluators/EvaluatorBackfillSettings/components/DateRangeInput/DateRangeInput";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { numberFormatter } from "@/src/utils/numbers";
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
  summaryLabel: string;
}> = [
  {
    value: "24-hours",
    label: "Last 24 hours",
    summaryLabel: "the last 24 hours",
  },
  {
    value: "7-days",
    label: "Last 7 days",
    summaryLabel: "the last 7 days",
  },
  {
    value: "30-days",
    label: "Last 30 days",
    summaryLabel: "the last 30 days",
  },
  {
    value: "90-days",
    label: "Last 90 days",
    summaryLabel: "the last 90 days",
  },
  {
    value: "custom",
    label: "Custom range",
    summaryLabel: "the selected range",
  },
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
  const selectedWindowOption = windowOptions.find(
    (option) => option.value === selectedWindow,
  );
  const rangeDescription =
    selectedWindow === "custom"
      ? `the selected range (${rangeDays} days)`
      : (selectedWindowOption?.summaryLabel ?? "the selected range");

  return (
    <section className="ml-6 max-w-full min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <Switch
          id="evaluator-backfill-enabled"
          size="sm"
          checked={enabled}
          disabled={!canEnable}
          onCheckedChange={onEnabledChange}
        />
        <label
          htmlFor="evaluator-backfill-enabled"
          className={cn(
            "min-w-0 text-sm leading-none",
            canEnable ? "cursor-pointer" : "text-muted-foreground",
          )}
        >
          Run evaluator on past observations matching these filters
        </label>
      </div>

      {enabled ? (
        <div className="mt-3 ml-9 max-w-full min-w-0 space-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
            <span>Score the newest</span>
            <Input
              id="evaluator-backfill-max-items"
              aria-label="Max items"
              type="number"
              min={1}
              max={maxAllowedItems}
              className="w-20 text-right font-mono text-sm"
              value={maxItems}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (!Number.isFinite(value)) return;
                onMaxItemsChange(
                  Math.min(maxAllowedItems, Math.max(1, Math.floor(value))),
                );
              }}
            />
            <span>matches from the</span>
            <Select
              value={selectedWindow}
              onValueChange={(value) =>
                onWindowChange(value as EvaluatorBackfillWindow)
              }
            >
              <SelectTrigger
                aria-label="Backfill time window"
                className="w-fit max-w-full whitespace-nowrap"
                disableValueLineClamp
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {windowOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedWindow === "custom" ? (
            <DateRangeInput
              value={{
                from: format(range.from, "yyyy-MM-dd"),
                to: format(range.to, "yyyy-MM-dd"),
              }}
              min={format(subMonths(new Date(), 6), "yyyy-MM-dd")}
              max={format(new Date(), "yyyy-MM-dd")}
              fromAriaLabel="Backfill start date"
              toAriaLabel="Backfill end date"
              onValueChange={(value) =>
                onRangeChange({
                  from: new Date(`${value.from}T00:00:00`),
                  to: new Date(`${value.to}T23:59:59.999`),
                })
              }
            />
          ) : null}

          <p className="text-muted-foreground text-xs break-words">
            {isEstimating
              ? "Counting matching observations..."
              : matchingObservations > maxItems
                ? `${numberFormatter(matchingObservations, 0)} observations in ${rangeDescription} — capping at ${numberFormatter(cappedCount, 0)}, newest first.`
                : `${numberFormatter(matchingObservations, 0)} observations in ${rangeDescription}, all within your limit.`}
          </p>
        </div>
      ) : null}
    </section>
  );
}
