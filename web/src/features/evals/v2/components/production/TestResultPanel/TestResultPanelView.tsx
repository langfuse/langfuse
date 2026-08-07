import { Clock, Coins, ExternalLink, MoreVertical, Play } from "lucide-react";

import { Switch } from "@/src/components/design-system/Switch/Switch";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { costFormatter } from "@/src/utils/numbers";

export type TestResultPanelState =
  | { status: "empty" }
  | { status: "running" }
  | { status: "request-error"; message: string }
  | { status: "run-error"; message: string }
  | {
      status: "llm-success";
      score: string;
      reasoning: string | null;
    }
  | {
      status: "code-success";
      scores: Array<{
        name: string;
        value: string;
        comment: string | null;
      }>;
    };

export function TestResultPanelView({
  result,
  durationMs,
  estimatedCostUsd,
  rawOutput,
  rawOpen,
  onRawOpenChange,
  isRerunning,
  rerunDisabledReason,
  onRerun,
  onOpenSampleTrace,
  executionTraceId,
  onOpenExecutionTrace,
}: {
  result: TestResultPanelState;
  durationMs: number | null;
  estimatedCostUsd: number | null;
  rawOutput: unknown | null;
  rawOpen: boolean;
  onRawOpenChange: (open: boolean) => void;
  isRerunning: boolean;
  rerunDisabledReason: string | null;
  onRerun: () => void;
  onOpenSampleTrace: (() => void) | null;
  executionTraceId: string | null;
  onOpenExecutionTrace: ((executionTraceId: string) => void) | null;
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="bg-muted/40 flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <p className="text-sm font-bold">Result</p>
        {durationMs !== null ? (
          <span
            className="text-muted-foreground flex items-center gap-1 text-xs"
            title="Duration of the test call"
          >
            <Clock className="h-3 w-3" />
            {(durationMs / 1000).toFixed(2)}s
          </span>
        ) : null}
        {estimatedCostUsd !== null ? (
          <span
            className="text-muted-foreground flex items-center gap-1 text-xs"
            title="Estimated cost of the test call — also feeds the daily projection when saving"
          >
            <Coins className="h-3 w-3" />
            {costFormatter(estimatedCostUsd)}
          </span>
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-xs">
            <Switch
              size="sm"
              checked={rawOpen}
              onCheckedChange={onRawOpenChange}
            />
            Raw output
          </label>
          {onOpenSampleTrace || (executionTraceId && onOpenExecutionTrace) ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title="More"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onOpenSampleTrace ? (
                  <DropdownMenuItem onClick={onOpenSampleTrace}>
                    <ExternalLink className="mr-2 h-3.5 w-3.5" />
                    Open sample trace
                  </DropdownMenuItem>
                ) : null}
                {executionTraceId && onOpenExecutionTrace ? (
                  <DropdownMenuItem
                    onClick={() => onOpenExecutionTrace(executionTraceId)}
                  >
                    <ExternalLink className="mr-2 h-3.5 w-3.5" />
                    Open execution trace
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
        {rawOpen ? (
          rawOutput === null ? (
            <p className="text-muted-foreground text-sm">
              No raw output available for this run.
            </p>
          ) : (
            <PrettyJsonView
              json={rawOutput}
              currentView="json"
              isLoading={false}
              showNullValues={true}
              stickyTopLevelKey={false}
              showObservationTypeBadge={false}
              scrollable={true}
              className="max-h-96"
            />
          )
        ) : result.status === "empty" ? (
          <p className="text-muted-foreground text-sm">No test run yet.</p>
        ) : result.status === "running" ? null : result.status ===
          "request-error" ? (
          <p className="text-destructive text-sm">{result.message}</p>
        ) : result.status === "run-error" ? (
          <div className="border-destructive/40 bg-destructive/5 flex flex-col gap-1 rounded-md border p-3">
            <p className="text-destructive text-sm font-bold">
              Test run failed
            </p>
            <p className="text-sm">{result.message}</p>
          </div>
        ) : result.status === "llm-success" ? (
          <div className="bg-muted/20 flex flex-col gap-3 rounded-md border p-3">
            <p className="text-sm font-bold">LLM output</p>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">Score</span>
              <span className="text-2xl leading-none font-bold">
                {result.score}
              </span>
            </div>
            {result.reasoning ? (
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs">
                  Model reasoning
                </span>
                <p className="text-sm leading-relaxed">{result.reasoning}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="bg-muted/20 flex flex-col gap-3 rounded-md border p-3">
            <p className="text-sm font-bold">Code output</p>
            {result.scores.map((score, index) => (
              <div
                key={index}
                className="flex flex-col gap-2 border-t pt-3 first:border-t-0 first:pt-0"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground text-xs">
                    {score.name}
                  </span>
                  <span className="text-2xl leading-none font-bold">
                    {score.value}
                  </span>
                </div>
                {score.comment ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs">
                      Comment
                    </span>
                    <p className="text-sm leading-relaxed">{score.comment}</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={
            result.status === "running" ? "self-start" : "mt-4 self-start"
          }
          loading={isRerunning}
          disabled={rerunDisabledReason !== null}
          title={rerunDisabledReason ?? "Run the test again"}
          onClick={onRerun}
        >
          <Play className="mr-1.5 h-3.5 w-3.5" />
          Run again
        </Button>
      </div>
    </div>
  );
}
