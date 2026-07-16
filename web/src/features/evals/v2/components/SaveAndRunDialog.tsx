import { useEffect, useMemo, useRef, useState } from "react";
import { Coins, Info, Loader2 } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { DatePicker } from "@/src/components/date-picker";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Slider } from "@/src/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { api } from "@/src/utils/api";
import { compactNumberFormatter, costFormatter } from "@/src/utils/numbers";
import { type FilterState } from "@langfuse/shared";

export type SaveEvaluatorOptions = {
  /** Keep evaluating new matching observations. */
  enabled: boolean;
  /** One-time pass over historic matches; null skips the backfill. */
  backfill: { from: Date; to: Date; maxCount: number | null } | null;
};

/**
 * The final save choices for an evaluator. Scope selection is intentionally
 * absent: the caller reuses an identical scope or creates a timestamped one.
 */
export function SaveAndRunDialog({
  projectId,
  open,
  onOpenChange,
  filterState,
  sampling,
  onSamplingChange,
  testRunCostUsd,
  isSaving,
  onConfirm,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filterState: FilterState;
  sampling: number;
  onSamplingChange: (value: number) => void;
  /** Per-evaluation cost from the last successful test run; null = no run. */
  testRunCostUsd: number | null;
  isSaving: boolean;
  onConfirm: (options: SaveEvaluatorOptions) => void;
}) {
  const [enabled, setEnabled] = useState(true);
  const [backfill, setBackfill] = useState(false);
  const [backfillFrom, setBackfillFrom] = useState<Date | undefined>(undefined);
  const [backfillTo, setBackfillTo] = useState<Date | undefined>(undefined);
  const [maxLimit, setMaxLimit] = useState("");
  // Count new observations over a fixed trailing day, independent of the
  // page's date filter, so the cost estimate has a stable meaning.
  const [anchor, setAnchor] = useState(() => new Date());
  const since = useMemo(
    () => new Date(anchor.getTime() - 24 * 60 * 60 * 1000),
    [anchor],
  );

  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const now = new Date();
      setEnabled(true);
      setBackfill(false);
      setBackfillFrom(new Date(now.getTime() - 24 * 60 * 60 * 1000));
      setBackfillTo(now);
      setMaxLimit("");
      setAnchor(now);
    }
    wasOpenRef.current = open;
  }, [open]);

  const maxLimitNumber = /^\d+$/.test(maxLimit.trim())
    ? Number(maxLimit.trim())
    : null;
  const maxLimitInvalid = maxLimit.trim() !== "" && !maxLimitNumber;
  const backfillWindowInvalid =
    backfill && (!backfillFrom || !backfillTo || backfillFrom > backfillTo);

  const countFilter = useMemo<FilterState>(
    () => [
      ...filterState,
      { column: "startTime", type: "datetime", operator: ">=", value: since },
    ],
    [filterState, since],
  );
  const matchCount = api.events.countAll.useQuery(
    {
      projectId,
      filter: countFilter,
      searchQuery: null,
      searchType: [],
      orderBy: null,
    },
    { enabled: open && enabled, refetchOnWindowFocus: false },
  );
  const count = matchCount.data?.totalCount ?? null;

  const backfillCountFilter = useMemo<FilterState>(
    () => [
      ...filterState,
      ...(backfillFrom
        ? ([
            {
              column: "startTime",
              type: "datetime",
              operator: ">=",
              value: backfillFrom,
            },
          ] as const)
        : []),
      ...(backfillTo
        ? ([
            {
              column: "startTime",
              type: "datetime",
              operator: "<=",
              value: backfillTo,
            },
          ] as const)
        : []),
    ],
    [filterState, backfillFrom, backfillTo],
  );
  const backfillCount = api.events.countAll.useQuery(
    {
      projectId,
      filter: backfillCountFilter,
      searchQuery: null,
      searchType: [],
      orderBy: null,
    },
    {
      enabled: open && backfill && !backfillWindowInvalid,
      refetchOnWindowFocus: false,
    },
  );
  const existingMatchCount = backfillCount.data?.totalCount ?? null;
  const backfillEvalCount =
    existingMatchCount !== null
      ? maxLimitNumber
        ? Math.min(existingMatchCount, maxLimitNumber)
        : existingMatchCount
      : null;

  const dailyCostUsd =
    count !== null && testRunCostUsd !== null
      ? count * sampling * testRunCostUsd
      : null;
  const backfillCostUsd =
    backfillEvalCount !== null && testRunCostUsd !== null
      ? backfillEvalCount * testRunCostUsd
      : null;

  const confirm = () => {
    onConfirm({
      enabled,
      backfill:
        backfill && backfillFrom && backfillTo
          ? { from: backfillFrom, to: backfillTo, maxCount: maxLimitNumber }
          : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Save evaluator</DialogTitle>
          <DialogDescription className="mt-1.5">
            Enable it for new observations, backfill historic observations, or
            save it disabled for later.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="gap-4">
          <div className="flex flex-col gap-3 rounded-md border p-3">
            <div className="flex items-center gap-2.5">
              <Switch
                id="enable-evaluator"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
              <Label
                htmlFor="enable-evaluator"
                className="cursor-pointer font-normal"
                title="Evaluate new matching observations from now on."
              >
                Enable evaluator
              </Label>
            </div>

            {enabled && (
              <div className="flex flex-col gap-2 border-t pt-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="flex items-center gap-1.5 font-normal">
                    Sampling rate
                    <Info
                      className="text-muted-foreground h-3.5 w-3.5"
                      aria-hidden
                    />
                    <span className="sr-only">
                      The share of matching items that gets evaluated.
                    </span>
                  </Label>
                  <div
                    className="flex items-center gap-1"
                    title="The share of matching items that gets evaluated — lower it to trade coverage for cost."
                  >
                    <Input
                      aria-label="Sampling rate percentage"
                      className="h-8 w-16 text-right font-mono"
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      value={Math.round(sampling * 100)}
                      onChange={(event) => {
                        const percentage = Number(event.target.value);
                        if (!Number.isFinite(percentage)) return;
                        onSamplingChange(
                          Math.min(100, Math.max(1, percentage)) / 100,
                        );
                      }}
                    />
                    <span className="text-muted-foreground text-sm">%</span>
                  </div>
                </div>
                <Slider
                  min={0.01}
                  max={1}
                  step={0.01}
                  value={[sampling]}
                  onValueChange={(value) => onSamplingChange(value[0] ?? 1)}
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-md border p-3">
            <div className="flex items-center gap-2.5">
              <Switch
                id="one-time-backfill"
                checked={backfill}
                onCheckedChange={setBackfill}
              />
              <Label
                htmlFor="one-time-backfill"
                className="cursor-pointer font-normal"
                title="Evaluate existing matching observations once."
              >
                One-time backfill
              </Label>
            </div>

            {backfill && (
              <div className="flex flex-col gap-2 border-t pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <DatePicker
                    date={backfillFrom}
                    onChange={(date) => setBackfillFrom(date)}
                    includeTimePicker
                  />
                  <span className="text-muted-foreground">–</span>
                  <DatePicker
                    date={backfillTo}
                    onChange={(date) => setBackfillTo(date)}
                    includeTimePicker
                  />
                </div>
                {backfillWindowInvalid && (
                  <p className="text-destructive text-sm">
                    Pick a start that lies before the end of the window.
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="backfill-max-limit"
                    className="shrink-0 font-normal"
                  >
                    Max limit
                  </Label>
                  <Input
                    id="backfill-max-limit"
                    inputMode="numeric"
                    value={maxLimit}
                    placeholder="Optional: at most this many observations"
                    onChange={(event) => setMaxLimit(event.target.value)}
                  />
                </div>
                {maxLimitInvalid && (
                  <p className="text-destructive text-sm">
                    The max limit must be a positive whole number.
                  </p>
                )}
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter className="p-4">
          {(enabled || backfill) && (
            <div className="text-muted-foreground flex min-w-0 flex-1 items-center gap-1.5 self-center text-sm sm:mr-auto">
              {testRunCostUsd === null ? (
                <>
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  Run a test on a sample to estimate cost.
                </>
              ) : (enabled && matchCount.isLoading) ||
                (backfill && backfillCount.isLoading) ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  Estimating cost…
                </>
              ) : (
                <span className="flex min-w-0 items-center gap-1.5">
                  <Coins className="h-3.5 w-3.5 shrink-0" />
                  {`Estimated cost: ${[
                    enabled
                      ? dailyCostUsd !== null
                        ? `≈ ${costFormatter(dailyCostUsd)} / day`
                        : "≈ — / day"
                      : null,
                    backfill && !backfillWindowInvalid
                      ? backfillCostUsd !== null
                        ? `+ ${costFormatter(backfillCostUsd)} one-time`
                        : "+ — one-time"
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}`}
                  <Tooltip>
                    <TooltipTrigger className="cursor-help">
                      <Info
                        className="h-3.5 w-3.5 shrink-0"
                        aria-label="How this is calculated"
                      />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm" side="top">
                      <p className="font-medium">
                        {`Projected from the test run's ${costFormatter(testRunCostUsd)} per evaluation:`}
                      </p>
                      {enabled && count !== null && (
                        <p className="mt-1">
                          {`Enabled: ${compactNumberFormatter(count)} matching observation${count === 1 ? "" : "s"} in the last 24h${sampling < 1 ? ` × ${Math.round(sampling * 100)}% sampling` : ""} × cost per evaluation ≈ ${dailyCostUsd !== null ? costFormatter(dailyCostUsd) : "—"} / day.`}
                        </p>
                      )}
                      {backfill && backfillEvalCount !== null && (
                        <p className="mt-1">
                          {`Backfill: ${compactNumberFormatter(backfillEvalCount)} observation${backfillEvalCount === 1 ? "" : "s"} in the window × cost per evaluation ≈ ${backfillCostUsd !== null ? costFormatter(backfillCostUsd) : "—"} one-time (sampling does not apply).`}
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </span>
              )}
            </div>
          )}
          <Button
            type="button"
            variant="ghost"
            disabled={isSaving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            loading={isSaving}
            disabled={maxLimitInvalid || Boolean(backfillWindowInvalid)}
            onClick={confirm}
          >
            {enabled ? "Save and run evaluator" : "Save evaluator"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
