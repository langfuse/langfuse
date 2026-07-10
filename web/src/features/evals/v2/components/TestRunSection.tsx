import { type ReactNode, useState } from "react";
import { ChevronDown, Play } from "lucide-react";

import { Badge } from "@/src/components/ui/badge";
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
 * Section wrapper: header row with the title and the test button on the
 * right (LangSmith-style), the sample preview as children, and the test
 * result below.
 */
export function TestRunSection({
  title,
  headerControls,
  getPayload,
  disabledReason,
  codeMode = false,
  children,
}: {
  title: string;
  /** Compact controls rendered inline next to the title (e.g. trace picker). */
  headerControls?: ReactNode;
  /** Returns null when the current form state cannot be tested. */
  getPayload: () => TestRunPayload | null;
  disabledReason: string | null;
  /** Code evaluators cannot be test-run in this prototype. */
  codeMode?: boolean;
  children: ReactNode;
}) {
  const [promptOpen, setPromptOpen] = useState(false);
  const testRun = api.evalsV2.testRunLlmJudge.useMutation();

  const result = testRun.data;
  const disabled = codeMode || Boolean(disabledReason);
  const disabledHint = codeMode
    ? "Test runs for code evaluators aren't wired in this prototype."
    : disabledReason;

  return (
    <section className="flex shrink-0 flex-col gap-3 pb-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <p className="shrink-0 text-sm font-medium">{title}</p>
          {headerControls}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={testRun.isPending}
          disabled={disabled}
          title={disabledHint ?? undefined}
          onClick={() => {
            const payload = getPayload();
            if (payload) testRun.mutate(payload);
          }}
        >
          <Play className="mr-1.5 h-3.5 w-3.5" />
          Test on selected trace
        </Button>
      </div>

      {children}

      {disabled && disabledHint && (
        <p className="text-muted-foreground text-xs">{disabledHint}</p>
      )}

      {!codeMode && testRun.error && (
        <p className="text-destructive text-xs">{testRun.error.message}</p>
      )}

      {!codeMode &&
        result &&
        (result.success ? (
          <div className="bg-muted/50 flex flex-col gap-2 rounded-md p-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono">
                {String(result.score)}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {result.provider}/{result.model}
              </span>
            </div>
            {result.reasoning && (
              <p className="text-xs leading-relaxed">{result.reasoning}</p>
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
    </section>
  );
}
