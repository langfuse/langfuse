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
import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";
import { Slider } from "@/src/components/ui/slider";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { generateRunScopeName } from "@/src/features/evals/v2/components/RunScopeSection";
import { type ScopeTargetObject } from "@/src/features/evals/v2/lib/scopeTarget";
import { api } from "@/src/utils/api";
import { compactNumberFormatter, costFormatter } from "@/src/utils/numbers";
import { cn } from "@/src/utils/tailwind";
import { type FilterState } from "@langfuse/shared";

export type SaveAndRunScopeChoice =
  | { mode: "existing"; runScopeId: string }
  | { mode: "new"; name: string };

/** Run options confirmed alongside the scope choice. */
export type SaveAndRunOptions = {
  /** Keep evaluating new data as it arrives (timeScope NEW). */
  runContinuously: boolean;
  /** One-time pass over existing data; null = no backfill. */
  backfill: { from: Date; to: Date; maxCount: number | null } | null;
};

type ExistingScope = {
  id: string;
  name: string;
  targetObject: string;
  filter: FilterState;
  sampling: number;
  _count: { jobConfigurations: number };
};

// Key-order-insensitive JSON: saved filters round-trip through Postgres
// JSONB, which reorders object keys, so plain JSON.stringify never matches
// the client draft.
const canonicalJson = (value: unknown): string =>
  JSON.stringify(value, (_key, node) =>
    node && typeof node === "object" && !Array.isArray(node)
      ? Object.fromEntries(
          Object.entries(node as Record<string, unknown>).sort(([a], [b]) =>
            a.localeCompare(b),
          ),
        )
      : node,
  );

/**
 * "Save and run" confirmation: names the run scope this evaluator will attach
 * to. When the current filter matches an already-saved scope, the default is
 * to re-use it (keeping evaluators in sync) instead of creating a duplicate.
 * Run options live here too: the sample rate, whether the evaluator keeps
 * running on new data, and an optional one-time backfill over a past window
 * (with an optional cap). A footer line projects each enabled part's cost
 * from the test run's per-call cost. The backfill estimate ignores the
 * sample rate — the batch pass evaluates every match.
 */
export function SaveAndRunDialog({
  projectId,
  open,
  onOpenChange,
  dataSource,
  filterState,
  sampling,
  onSamplingChange,
  existingScopes,
  testRunCostUsd,
  isCodeEvaluator = false,
  isSaving,
  onConfirm,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataSource: ScopeTargetObject;
  filterState: FilterState;
  sampling: number;
  onSamplingChange: (value: number) => void;
  existingScopes: ExistingScope[];
  /** Per-evaluation cost from the last successful test run; null = no run. */
  testRunCostUsd: number | null;
  /** Code evaluators run without LLM calls — no cost projection. */
  isCodeEvaluator?: boolean;
  isSaving: boolean;
  onConfirm: (
    choice: SaveAndRunScopeChoice,
    options: SaveAndRunOptions,
  ) => void;
}) {
  // An identical already-saved scope (same target + filter): re-using it keeps
  // the attached evaluators in sync instead of piling up duplicates.
  const matchingScope = useMemo(
    () =>
      existingScopes.find(
        (scope) =>
          scope.targetObject === dataSource &&
          canonicalJson(scope.filter) === canonicalJson(filterState),
      ) ?? null,
    [existingScopes, dataSource, filterState],
  );

  const generatedName = useMemo(
    () =>
      generateRunScopeName({
        filter: filterState,
        targetObject: dataSource,
        existingNames: existingScopes.map((scope) => scope.name),
      }),
    [filterState, dataSource, existingScopes],
  );

  const [choice, setChoice] = useState<"reuse" | "new">("new");
  const [name, setName] = useState("");
  const [runContinuously, setRunContinuously] = useState(true);
  const [backfill, setBackfill] = useState(false);
  const [backfillFrom, setBackfillFrom] = useState<Date | undefined>(undefined);
  const [backfillTo, setBackfillTo] = useState<Date | undefined>(undefined);
  const [maxLimit, setMaxLimit] = useState("");
  // Volume anchor for the trailing-24h count and the default backfill window —
  // refreshed on open, and deliberately independent of the page's time-range
  // picker so the projection always reads "per day".
  const [anchor, setAnchor] = useState(() => new Date());
  const since = useMemo(
    () => new Date(anchor.getTime() - 24 * 60 * 60 * 1000),
    [anchor],
  );
  // Re-derive the defaults on each closed → open transition (the filter or
  // the saved scopes may have changed since the last open); edits while the
  // dialog stays open are never clobbered.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const now = new Date();
      setChoice(matchingScope ? "reuse" : "new");
      setName(generatedName);
      setRunContinuously(true);
      setBackfill(false);
      setBackfillFrom(new Date(now.getTime() - 24 * 60 * 60 * 1000));
      setBackfillTo(now);
      setMaxLimit("");
      setAnchor(now);
    }
    wasOpenRef.current = open;
  }, [open, matchingScope, generatedName]);

  const takenNames = useMemo(
    () =>
      new Set(existingScopes.map((scope) => scope.name.trim().toLowerCase())),
    [existingScopes],
  );
  const nameTaken =
    choice === "new" && takenNames.has(name.trim().toLowerCase());
  const nameMissing = choice === "new" && name.trim().length === 0;

  const isEventTarget = dataSource === "event";
  const maxLimitNumber = /^\d+$/.test(maxLimit.trim())
    ? Number(maxLimit.trim())
    : null;
  const maxLimitInvalid = maxLimit.trim() !== "" && !maxLimitNumber;
  const backfillWindowInvalid =
    backfill && (!backfillFrom || !backfillTo || backfillFrom > backfillTo);
  const nothingToRun = isEventTarget && !runContinuously && !backfill;

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
    {
      // Only feeds the cost summary, which code evaluators don't render.
      enabled: open && isEventTarget && runContinuously && !isCodeEvaluator,
      refetchOnWindowFocus: false,
    },
  );
  const count = matchCount.data?.totalCount ?? null;

  // Backfill volume: the scope's matches inside the selected window.
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
      enabled: open && isEventTarget && backfill && !backfillWindowInvalid,
      refetchOnWindowFocus: false,
    },
  );
  const existingMatchCount = backfillCount.data?.totalCount ?? null;
  // The user cap trims the pass; the batch evaluates every remaining match
  // (no sampling), so the estimate multiplies the capped count directly.
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
    const options: SaveAndRunOptions = {
      runContinuously: isEventTarget ? runContinuously : true,
      backfill:
        isEventTarget && backfill && backfillFrom && backfillTo
          ? { from: backfillFrom, to: backfillTo, maxCount: maxLimitNumber }
          : null,
    };
    if (choice === "reuse" && matchingScope) {
      onConfirm({ mode: "existing", runScopeId: matchingScope.id }, options);
      return;
    }
    onConfirm({ mode: "new", name: name.trim() }, options);
  };

  const evaluatorCount = matchingScope?._count.jobConfigurations ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Save and run evaluator</DialogTitle>
        </DialogHeader>

        {/* Hierarchy: two font-medium section headers (Scope, Execution),
            regular-weight field labels inside, gap-6 between sections vs
            gap-2/3 within — proximity does the grouping. */}
        <DialogBody className="gap-6">
          <div className="flex flex-col gap-2">
            <Label
              htmlFor={matchingScope ? undefined : "run-scope-name"}
              className="font-medium"
            >
              Scope
            </Label>
            {/* The dialog's description — it is all about the scope, so it
                sits under this header (Radix wires the aria from anywhere
                inside the content). mt-0 defers to the container gap. */}
            <DialogDescription className="mt-0">
              The evaluator runs on everything matching its scope. Name the
              scope so it can be reused by other evaluators.
            </DialogDescription>
            {matchingScope ? (
              <RadioGroup
                value={choice}
                onValueChange={(value) => setChoice(value as "reuse" | "new")}
                className="flex flex-col gap-2"
              >
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 text-sm",
                    choice === "reuse" && "border-primary bg-primary/5",
                  )}
                >
                  <RadioGroupItem value="reuse" className="mt-0.5" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span>{`Re-use "${matchingScope.name}"`}</span>
                    {choice === "reuse" && (
                      <span className="text-muted-foreground">
                        {`This exact scope already exists${
                          evaluatorCount > 0
                            ? ` and runs ${evaluatorCount} evaluator${evaluatorCount === 1 ? "" : "s"}`
                            : ""
                        }. Re-using keeps them in sync when the scope changes.`}
                      </span>
                    )}
                  </span>
                </label>
                <label
                  className={cn(
                    "flex cursor-pointer flex-col gap-2 rounded-md border p-2.5 text-sm",
                    choice === "new" && "border-primary bg-primary/5",
                  )}
                >
                  <span className="flex items-start gap-2.5">
                    <RadioGroupItem value="new" className="mt-0.5" />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span>Create a new scope</span>
                      {choice === "new" && (
                        <span className="text-muted-foreground">
                          Same filter, but managed independently from the
                          existing scope.
                        </span>
                      )}
                    </span>
                  </span>
                  {/* The naming lives inside the option — visible only while
                    this option is selected. */}
                  {choice === "new" && (
                    <span
                      className="flex flex-col gap-2 pl-6.5"
                      // The card is a <label>; keep clicks in the input from
                      // re-triggering the radio.
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Input
                        id="run-scope-name"
                        value={name}
                        placeholder={generatedName}
                        aria-label="Scope name"
                        onChange={(event) => setName(event.target.value)}
                      />
                      {nameTaken ? (
                        <span className="text-destructive">
                          A scope with this name already exists — pick another
                          name.
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          Shown wherever evaluators reference where they run.
                        </span>
                      )}
                    </span>
                  )}
                </label>
              </RadioGroup>
            ) : (
              <>
                <Input
                  id="run-scope-name"
                  value={name}
                  placeholder={generatedName}
                  onChange={(event) => setName(event.target.value)}
                />
                {nameTaken ? (
                  <p className="text-destructive text-sm">
                    A scope with this name already exists — pick another name.
                  </p>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Shown wherever evaluators reference where they run.
                  </p>
                )}
              </>
            )}
          </div>

          {/* gap-3 matches the spacing between the switch rows below, so the
              slider → first switch step reads as one evenly spaced list. */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label className="font-medium">Execution</Label>
              <p className="text-muted-foreground text-sm">
                How much of the scope gets evaluated, and when.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="flex items-center gap-1.5 font-normal">
                  Sampling rate (%)
                  <Info
                    className="text-muted-foreground h-3.5 w-3.5"
                    aria-hidden
                  />
                  <span className="sr-only">
                    The share of matching items that gets evaluated.
                  </span>
                </Label>
                <span
                  className="rounded-md border px-2 py-0.5 font-mono text-sm"
                  title="The share of matching items that gets evaluated — lower it to trade coverage for cost."
                >
                  {Math.round(sampling * 100)}
                </span>
              </div>
              <Slider
                min={0.01}
                max={1}
                step={0.01}
                value={[sampling]}
                onValueChange={(value) => onSamplingChange(value[0] ?? 1)}
                // Usually sits at 100%: a solid-primary bar would be the
                // loudest element in the dialog.
                rangeClassName="bg-primary/30"
              />
            </div>

            {isEventTarget && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2.5">
                  <Switch
                    id="run-continuously"
                    checked={runContinuously}
                    onCheckedChange={setRunContinuously}
                  />
                  <Label
                    htmlFor="run-continuously"
                    className="cursor-pointer font-normal"
                    title="Evaluate new data as it arrives, from now on."
                  >
                    Run continuously
                  </Label>
                </div>

                <div className="flex items-center gap-2.5">
                  <Switch
                    id="one-time-backfill"
                    checked={backfill}
                    onCheckedChange={setBackfill}
                  />
                  <Label
                    htmlFor="one-time-backfill"
                    className="cursor-pointer font-normal"
                    title="Evaluate the data the scope already matches, once."
                  >
                    One-time backfill
                  </Label>
                </div>

                {backfill && (
                  <div className="flex flex-col gap-2 pl-11">
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
                    {/* The window's volume, next to the controls that bound
                      it; the footer line carries only the ≈ totals. */}
                    {!backfillWindowInvalid &&
                      (backfillCount.isLoading ? (
                        <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Counting observations in the window…
                        </p>
                      ) : backfillEvalCount !== null ? (
                        <p className="text-muted-foreground text-sm">
                          {`Evaluates ${compactNumberFormatter(backfillEvalCount)} observation${backfillEvalCount === 1 ? "" : "s"} in the window`}
                          {maxLimitNumber &&
                          existingMatchCount !== null &&
                          existingMatchCount > maxLimitNumber
                            ? ` (capped from ${compactNumberFormatter(existingMatchCount)})`
                            : ""}
                          .
                        </p>
                      ) : null)}
                  </div>
                )}

                {nothingToRun && (
                  <p className="text-dark-yellow text-sm">
                    Nothing would run — enable continuous evaluation or a
                    one-time backfill.
                  </p>
                )}
              </div>
            )}
          </div>
        </DialogBody>

        {/* p-4 aligns the buttons with the body's content column (the shared
            footer's p-6 insets them 8px past everything above). */}
        <DialogFooter className="p-4">
          {/* Cost summary docked next to the action it informs — ≈ totals
              only; the per-part breakdowns live in the title tooltip. Code
              evaluators run without LLM calls, so nothing to project. */}
          {isEventTarget &&
            !isCodeEvaluator &&
            (runContinuously || backfill) && (
              <div className="text-muted-foreground flex min-w-0 flex-1 items-center gap-1.5 self-center text-sm sm:mr-auto">
                {testRunCostUsd === null ? (
                  <>
                    <Info className="h-3.5 w-3.5 shrink-0" />
                    <span
                      className="min-w-0 truncate"
                      title="Run a test on a sample to project the cost."
                    >
                      Run a test on a sample to project the cost.
                    </span>
                  </>
                ) : (runContinuously && matchCount.isLoading) ||
                  (backfill && backfillCount.isLoading) ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    Estimating cost…
                  </>
                ) : (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Coins className="h-3.5 w-3.5 shrink-0" />
                    {`Estimated cost: ${[
                      runContinuously
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
                        {runContinuously && count !== null && (
                          <p className="mt-1">
                            {`Continuous: ${compactNumberFormatter(count)} matching observation${count === 1 ? "" : "s"} in the last 24h${sampling < 1 ? ` × ${Math.round(sampling * 100)}% sampling` : ""} × cost per evaluation ≈ ${dailyCostUsd !== null ? costFormatter(dailyCostUsd) : "—"} / day.`}
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
            variant="outline"
            disabled={isSaving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            loading={isSaving}
            disabled={
              nameTaken ||
              nameMissing ||
              nothingToRun ||
              maxLimitInvalid ||
              Boolean(backfillWindowInvalid)
            }
            onClick={confirm}
          >
            Save and run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
