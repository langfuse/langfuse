import { type ReactNode } from "react";
import { Clock, Coins } from "lucide-react";

import { Switch } from "@/src/components/design-system/Switch/Switch";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { usdFormatter } from "@/src/utils/numbers";

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

/** One measurement of the test call in the header strip. */
function ResultStat({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Clock;
  title: string;
  children: ReactNode;
}) {
  return (
    <span
      className="text-muted-foreground flex -translate-y-px items-center gap-1 font-mono text-xs leading-none tabular-nums"
      title={title}
    >
      <Icon className="h-3 w-3" />
      <span className="translate-y-0.5">{children}</span>
    </span>
  );
}

function TestResultHeader({
  title,
  durationMs,
  estimatedCostUsd,
  rawOpen,
  onRawOpenChange,
  traceActions,
}: {
  title: "LLM Output" | "Code Output";
  durationMs: number | null;
  estimatedCostUsd: number | null;
  rawOpen: boolean;
  onRawOpenChange: (open: boolean) => void;
  traceActions: ReactNode;
}) {
  return (
    <div className="bg-secondary text-secondary-foreground flex flex-wrap items-center gap-2 border-b px-3 py-2">
      <p className="text-sm leading-none font-bold">{title}</p>
      {durationMs !== null ? (
        <ResultStat icon={Clock} title="Duration of the test call">
          {(durationMs / 1000).toFixed(2)}s
        </ResultStat>
      ) : null}
      {estimatedCostUsd !== null ? (
        <ResultStat
          icon={Coins}
          title="Estimated cost of the test call — also feeds the daily projection when saving"
        >
          {usdFormatter(estimatedCostUsd)}
        </ResultStat>
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
        {traceActions}
      </span>
    </div>
  );
}

function RawOutputView({ rawOutput }: { rawOutput: unknown | null }) {
  if (rawOutput === null) {
    return (
      <p className="text-muted-foreground text-sm">
        No raw output available for this run.
      </p>
    );
  }

  return (
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
  );
}

/** Frame shared by the successful LLM and code outputs. */
function ResultCard({ children }: { children: ReactNode }) {
  return (
    <div className="bg-card text-card-foreground flex flex-col gap-3 rounded-md border p-3">
      {children}
    </div>
  );
}

/** The headline number a run produced. */
function ScoreValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-mono text-2xl leading-none font-bold tabular-nums">
        {value}
      </span>
    </div>
  );
}

/** Prose that accompanies a score — model reasoning or a code comment. */
function ScoreNote({ label, children }: { label: string; children: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <p className="text-sm leading-relaxed">{children}</p>
    </div>
  );
}

function LlmResultView({
  score,
  reasoning,
}: Omit<Extract<TestResultPanelState, { status: "llm-success" }>, "status">) {
  return (
    <ResultCard>
      <ScoreValue label="Score" value={score} />
      {reasoning ? (
        <ScoreNote label="Model reasoning">{reasoning}</ScoreNote>
      ) : null}
    </ResultCard>
  );
}

function CodeResultView({
  scores,
}: Omit<Extract<TestResultPanelState, { status: "code-success" }>, "status">) {
  return (
    <ResultCard>
      {scores.map((score, index) => (
        <div
          key={index}
          className="flex flex-col gap-2 border-t pt-3 first:border-t-0 first:pt-0"
        >
          <ScoreValue label={score.name} value={score.value} />
          {score.comment ? (
            <ScoreNote label="Comment">{score.comment}</ScoreNote>
          ) : null}
        </div>
      ))}
    </ResultCard>
  );
}

function RunErrorView({ message }: { message: string }) {
  return (
    <div className="border-destructive/40 bg-destructive/5 flex flex-col gap-1 rounded-md border p-3">
      <p className="text-destructive text-sm font-bold">Test run failed</p>
      <p className="text-sm">{message}</p>
    </div>
  );
}

// One renderer per status, each typed against its own payload.
const RESULT_VIEWS: {
  [Status in TestResultPanelState["status"]]: (
    result: Extract<TestResultPanelState, { status: Status }>,
  ) => ReactNode;
} = {
  empty: () => (
    <p className="text-muted-foreground text-sm">No test run yet.</p>
  ),
  // The rerun button carries the pending state on its own.
  running: () => null,
  "request-error": ({ message }) => (
    <p className="text-destructive text-sm">{message}</p>
  ),
  "run-error": ({ message }) => <RunErrorView message={message} />,
  "llm-success": ({ score, reasoning }) => (
    <LlmResultView score={score} reasoning={reasoning} />
  ),
  "code-success": ({ scores }) => <CodeResultView scores={scores} />,
};

function renderResult<Status extends TestResultPanelState["status"]>(
  status: Status,
  result: Extract<TestResultPanelState, { status: Status }>,
) {
  return RESULT_VIEWS[status](result);
}

function TestResultView({ result }: { result: TestResultPanelState }) {
  return renderResult(result.status, result);
}

export function TestResultPanelView({
  title,
  result,
  durationMs,
  estimatedCostUsd,
  rawOutput,
  rawOpen,
  onRawOpenChange,
  traceActions,
  rerunAction,
}: {
  title: "LLM Output" | "Code Output";
  result: TestResultPanelState;
  durationMs: number | null;
  estimatedCostUsd: number | null;
  rawOutput: unknown | null;
  rawOpen: boolean;
  onRawOpenChange: (open: boolean) => void;
  traceActions: ReactNode;
  rerunAction: ReactNode;
}) {
  return (
    <div className="bg-card text-card-foreground flex min-h-0 flex-col overflow-hidden rounded-md border">
      <TestResultHeader
        title={title}
        durationMs={durationMs}
        estimatedCostUsd={estimatedCostUsd}
        rawOpen={rawOpen}
        onRawOpenChange={onRawOpenChange}
        traceActions={traceActions}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
        {rawOpen ? (
          <RawOutputView rawOutput={rawOutput} />
        ) : (
          <TestResultView result={result} />
        )}
        <div className="mt-4 self-start first:mt-0">{rerunAction}</div>
      </div>
    </div>
  );
}
