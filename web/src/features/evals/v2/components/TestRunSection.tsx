import { useMemo, useState } from "react";
import { ArrowLeft, Clock, ExternalLink, Play } from "lucide-react";

import { Switch } from "@/src/components/design-system/Switch/Switch";
import { Button } from "@/src/components/ui/button";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import {
  deepParseJson,
  type ObservationVariableMapping,
  type PersistedEvalOutputDefinition,
} from "@langfuse/shared";

export type TestRunPayload = {
  projectId: string;
  prompt: string;
  sourceTemplateId?: string | null;
  provider?: string | null;
  model?: string | null;
  modelParams?: Record<string, unknown> | null;
  outputDefinition?: PersistedEvalOutputDefinition | null;
  mapping: ObservationVariableMapping[];
  observationId: string;
  traceId: string;
  observationStartTime?: Date;
};

export type CodeTestRunPayload = {
  projectId: string;
  sourceCode: string;
  sourceCodeLanguage: "PYTHON" | "TYPESCRIPT";
  scoreName: string;
  mapping: ObservationVariableMapping[];
  observationId: string;
  traceId: string;
  observationStartTime: Date;
};

/**
 * The test-run mutations, owned by the form so the trigger and the result
 * can share their state.
 */
export function useTestRunMutation() {
  return api.evalsV2.testRunLlmJudge.useMutation();
}

export type TestRunMutation = ReturnType<typeof useTestRunMutation>;

export function useCodeTestRunMutation() {
  return api.evalsV2.testRunCodeEval.useMutation();
}

export type CodeTestRunMutation = ReturnType<typeof useCodeTestRunMutation>;

/** The test-run CTA for the Test step (LLM and code evaluators alike). */
export function TestRunButton({
  isPending,
  onRun,
  disabledReason,
  className,
}: {
  isPending: boolean;
  onRun: () => void;
  disabledReason: string | null;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      loading={isPending}
      disabled={Boolean(disabledReason)}
      title={disabledReason ?? "Run the evaluator on the selected sample"}
      onClick={onRun}
    >
      <Play className="mr-1.5 h-3.5 w-3.5" />
      Run test on this sample
    </Button>
  );
}

/** Legacy-shaped "Evaluator input" preview: what the code receives. */
function EvaluatorInputPreview({
  sampleObservation,
}: {
  sampleObservation: Record<string, unknown>;
}) {
  // Same shape as the legacy code-eval test-run card's input preview.
  const inputPreviewJson = useMemo(
    () => ({
      observation: {
        input: deepParseJson(sampleObservation.input),
        output: deepParseJson(sampleObservation.output),
        metadata: deepParseJson(sampleObservation.metadata),
      },
    }),
    [sampleObservation],
  );

  return (
    <div className="bg-muted/20 flex min-h-0 min-w-0 flex-1 flex-col rounded-md border">
      {/* Fills whatever height the panel grants and scrolls inside it, so
          expanding tree nodes can never grow the panel. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <PrettyJsonView
          json={inputPreviewJson}
          currentView="pretty"
          isLoading={false}
          showNullValues={true}
          stickyTopLevelKey={false}
          showObservationTypeBadge={false}
          className="[&_.border]:border-0 [&_.rounded-sm]:rounded-none"
        />
      </div>
    </div>
  );
}

/**
 * Idle test hub for the code-evaluator split: code has no variables to map,
 * so the panel's resting state is the run CTA plus the legacy-shaped
 * evaluator-input preview of the sample the code will receive.
 */
export function TestIdlePanel({
  isPending,
  disabledReason,
  onRun,
  lastResultLabel,
  onOpenLastResult,
  sampleObservation,
  className,
}: {
  isPending: boolean;
  disabledReason: string | null;
  onRun: () => void;
  lastResultLabel: string | null;
  onOpenLastResult: () => void;
  /** The sample the code will run on — fills the panel with what
      ctx.observation contains. */
  sampleObservation?: Record<string, unknown> | null;
  className?: string;
}) {
  return (
    <div
      className={cn("flex min-h-0 flex-col gap-2 p-3", className)}
      data-variable-mapping-panel=""
    >
      <p className="text-muted-foreground shrink-0 text-sm">
        The data your evaluator receives as{" "}
        <code className="font-mono">ctx.observation</code> — from the sample
        selected in step 1.
      </p>
      {sampleObservation ? (
        <EvaluatorInputPreview sampleObservation={sampleObservation} />
      ) : (
        <div className="text-muted-foreground flex min-h-32 items-center justify-center rounded-md border border-dashed p-4 text-center text-sm">
          No matching observation
        </div>
      )}
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          loading={isPending}
          disabled={Boolean(disabledReason)}
          title={disabledReason ?? "Run the evaluator on the selected sample"}
          onClick={onRun}
        >
          <Play className="mr-1.5 h-3.5 w-3.5" />
          Test with sample
        </Button>
        {lastResultLabel && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-xs hover:underline"
            onClick={onOpenLastResult}
          >
            {`${lastResultLabel} ›`}
          </button>
        )}
      </div>
    </div>
  );
}

/** The code evaluator's scores (or error). */
function CodeTestRunResultBody({ testRun }: { testRun: CodeTestRunMutation }) {
  const result = testRun.data;

  return (
    <div className="flex flex-col gap-2">
      {testRun.error && (
        <p className="text-destructive text-sm">{testRun.error.message}</p>
      )}

      {result &&
        (result.success ? (
          <div className="flex flex-col gap-3">
            {result.scores.map((score, index) => (
              <div key={index} className="flex flex-col gap-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-muted-foreground text-sm">
                    {score.name}:
                  </span>
                  <span className="text-2xl leading-none font-semibold">
                    {String(score.value)}
                  </span>
                </div>
                {score.comment && (
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {score.comment}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="border-destructive/40 bg-destructive/5 flex flex-col gap-1 rounded-md border p-3">
            <p className="text-destructive text-sm font-medium">
              Test run failed
            </p>
            <p className="text-sm">{result.error}</p>
          </div>
        ))}
    </div>
  );
}

/** The judge's verdict (or error). */
function LlmTestRunResultBody({ testRun }: { testRun: TestRunMutation }) {
  const result = testRun.data;

  return (
    <div className="flex flex-col gap-2">
      {testRun.error && (
        <p className="text-destructive text-sm">{testRun.error.message}</p>
      )}

      {result &&
        (result.success ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-muted-foreground text-sm">Score:</span>
              <span className="text-2xl leading-none font-semibold">
                {String(result.score)}
              </span>
            </div>
            {result.reasoning && (
              <p className="text-muted-foreground text-sm leading-relaxed">
                {result.reasoning}
              </p>
            )}
          </div>
        ) : (
          <div className="border-destructive/40 bg-destructive/5 flex flex-col gap-1 rounded-md border p-3">
            <p className="text-destructive text-sm font-medium">
              Test run failed
            </p>
            <p className="text-sm">{result.error}</p>
          </div>
        ))}
    </div>
  );
}

/**
 * Test result surface shared by the mapping-panel state and the Test step:
 * header row with the toolbar (raw-output toggle, execution-trace link,
 * re-run), one body. `onBack` renders the panel-navigation arrow — omit it
 * where the surface isn't stacked on other views.
 */
export function TestResultPanel({
  isCodeMode,
  testRun,
  codeTestRun,
  isPending,
  disabledReason,
  onRerun,
  onBack,
  onOpenSampleTrace,
  onOpenExecutionTrace,
  className,
}: {
  isCodeMode: boolean;
  testRun: TestRunMutation;
  codeTestRun: CodeTestRunMutation;
  isPending: boolean;
  disabledReason: string | null;
  onRerun: () => void;
  onBack?: () => void;
  /** Opens the sample trace in the standard trace peek. */
  onOpenSampleTrace?: () => void;
  /** Opens the run's execution trace in the standard trace peek. */
  onOpenExecutionTrace?: (executionTraceId: string) => void;
  className?: string;
}) {
  const [rawOpen, setRawOpen] = useState(false);

  const hasData = isCodeMode
    ? Boolean(codeTestRun.data || codeTestRun.error)
    : Boolean(testRun.data || testRun.error);
  const durationMs = isCodeMode
    ? codeTestRun.data?.durationMs
    : testRun.data?.durationMs;
  const executionTraceId = isCodeMode
    ? codeTestRun.data?.executionTraceId
    : testRun.data?.executionTraceId;
  // The raw view carries the untouched response — for the judge that
  // includes the interpolated prompt and extracted variables.
  const raw: unknown = isCodeMode
    ? (codeTestRun.data?.raw ?? null)
    : testRun.data;

  return (
    <div
      className={cn("flex min-h-0 flex-col", className)}
      data-variable-mapping-panel=""
    >
      <div className="flex flex-wrap items-center gap-2 border-b p-2">
        {onBack && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="shrink-0"
            title="Back to the variables"
            onClick={onBack}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
        )}
        <p className="text-sm font-medium">Test result</p>
        {durationMs !== undefined && (
          <span
            className="text-muted-foreground flex items-center gap-1 text-xs"
            title="Duration of the test call"
          >
            <Clock className="h-3 w-3" />
            {(durationMs / 1000).toFixed(2)}s
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-xs">
            <Switch size="sm" checked={rawOpen} onCheckedChange={setRawOpen} />
            Raw output
          </label>
          {onOpenSampleTrace && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              title="Open the sample trace"
              onClick={onOpenSampleTrace}
            >
              <ExternalLink className="mr-1 h-3 w-3" />
              Sample trace
            </Button>
          )}
          {executionTraceId && onOpenExecutionTrace && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              title="Open the execution trace of this test run"
              onClick={() => onOpenExecutionTrace(executionTraceId)}
            >
              <ExternalLink className="mr-1 h-3 w-3" />
              Execution trace
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            loading={isPending}
            disabled={Boolean(disabledReason)}
            title={disabledReason ?? "Run the test again"}
            onClick={onRerun}
          >
            <Play className="mr-1.5 h-3 w-3" />
            Run again
          </Button>
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
        {!hasData ? (
          <p className="text-muted-foreground text-sm">
            {isPending ? "Running…" : "No test run yet."}
          </p>
        ) : rawOpen ? (
          raw === null || raw === undefined ? (
            <p className="text-muted-foreground text-sm">
              No raw output available for this run.
            </p>
          ) : (
            <pre className="bg-muted/30 rounded-md border p-2 font-mono text-xs break-all whitespace-pre-wrap">
              {JSON.stringify(raw, null, 2)}
            </pre>
          )
        ) : isCodeMode ? (
          <CodeTestRunResultBody testRun={codeTestRun} />
        ) : (
          <LlmTestRunResultBody testRun={testRun} />
        )}
      </div>
    </div>
  );
}
