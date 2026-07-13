import { useState } from "react";
import { ChevronDown, Play } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import {
  type PersistedEvalOutputDefinition,
  type variableMapping,
} from "@langfuse/shared";
import { type z } from "zod";

export type TestRunPayload = {
  projectId: string;
  prompt: string;
  sourceTemplateId?: string | null;
  provider?: string | null;
  model?: string | null;
  modelParams?: Record<string, unknown> | null;
  outputDefinition?: PersistedEvalOutputDefinition | null;
  mapping: z.infer<typeof variableMapping>[];
  traceId: string;
  traceTimestamp?: Date;
};

/**
 * The test-run mutation, owned by the form so the trigger (panel header) and
 * the result (panel footer) can share its state.
 */
export function useTestRunMutation() {
  return api.evalsV2.testRunLlmJudge.useMutation();
}

export type TestRunMutation = ReturnType<typeof useTestRunMutation>;

/** Compact trigger for the companion header. */
export function TestRunButton({
  testRun,
  getPayload,
  disabledReason,
  codeMode = false,
}: {
  testRun: TestRunMutation;
  /** Returns null when the current form state cannot be tested. */
  getPayload: () => TestRunPayload | null;
  disabledReason: string | null;
  /** Code evaluators cannot be test-run in this prototype. */
  codeMode?: boolean;
}) {
  const disabled = codeMode || Boolean(disabledReason);
  const disabledHint = codeMode
    ? "Test runs for code evaluators aren't wired in this prototype."
    : disabledReason;

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="h-6 px-2 text-xs"
      loading={testRun.isPending}
      disabled={disabled}
      title={disabledHint ?? "Run the evaluator on the selected sample"}
      onClick={() => {
        const payload = getPayload();
        if (payload) testRun.mutate(payload);
      }}
    >
      <Play className="mr-1 h-3 w-3" />
      Test
    </Button>
  );
}

/** The judge's verdict (or error), rendered in the companion footer. */
export function TestRunResult({
  testRun,
  codeMode = false,
}: {
  testRun: TestRunMutation;
  codeMode?: boolean;
}) {
  const [promptOpen, setPromptOpen] = useState(false);
  const result = testRun.data;

  if (codeMode) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Test output
      </p>

      {testRun.error && (
        <p className="text-destructive text-xs">{testRun.error.message}</p>
      )}

      {result &&
        (result.success ? (
          <div className="bg-background flex max-h-72 flex-col gap-2 overflow-y-auto rounded-md border p-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-muted-foreground text-xs">Score:</span>
              <span className="text-2xl leading-none font-semibold">
                {String(result.score)}
              </span>
            </div>
            {result.reasoning && (
              <p className="text-muted-foreground text-xs leading-relaxed">
                {result.reasoning}
              </p>
            )}
            <Collapsible open={promptOpen} onOpenChange={setPromptOpen}>
              <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs">
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform",
                    !promptOpen && "-rotate-90",
                  )}
                />
                Prompt sent to the judge
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="bg-background mt-1 max-h-56 overflow-y-auto rounded-md border p-2 font-mono text-xs whitespace-pre-wrap">
                  {result.interpolatedPrompt}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          </div>
        ) : (
          <div className="border-destructive/40 bg-destructive/5 flex flex-col gap-1 rounded-md border p-3">
            <p className="text-destructive text-xs font-medium">
              Test run failed
            </p>
            <p className="text-xs">{result.error}</p>
          </div>
        ))}
    </div>
  );
}
