import { CodeMirrorEditor } from "@/src/components/editor";
import { TablePeekViewTraceDetail } from "@/src/components/table/peek/peek-trace-detail";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import {
  type PreviewData,
  usePreviewData,
} from "@/src/features/evals/hooks/usePreviewData";
import { useFirstEvalPreviewPointer } from "@/src/features/evals/hooks/useEvalPreviewNavigation";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { detailPageListKeys } from "@/src/features/navigate-detail-pages/context";
import { api, type RouterOutputs } from "@/src/utils/api";
import {
  deepParseJson,
  EvalTargetObject,
  type EvalTemplate,
} from "@langfuse/shared";
import { ExternalLink, ListTree, Play, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { toast } from "sonner";

import { type EvalFormType } from "@/src/features/evals/utils/evaluator-form-utils";
import { getCodeEvalVariableMapping } from "@/src/features/evals/utils/code-eval-template-utils";
import {
  isEventTarget,
  isExperimentTarget,
} from "@/src/features/evals/utils/typeHelpers";

type CodeEvalTestRunResult =
  | RouterOutputs["evals"]["testRunCodeEval"]
  | undefined;
type CodeEvalTestRunScore = Extract<
  Exclude<CodeEvalTestRunResult, undefined>,
  { success: true }
>["result"]["scores"][number];
type CodeEvalInputPreviewData = Extract<
  PreviewData,
  { type: typeof EvalTargetObject.EVENT }
>;

function isCodeEvalTestTarget(
  target: EvalFormType["target"],
): target is
  | typeof EvalTargetObject.EVENT
  | typeof EvalTargetObject.EXPERIMENT {
  return isEventTarget(target) || isExperimentTarget(target);
}

export function CodeEvalTestRunCard({
  projectId,
  evalTemplate,
  target,
  scoreName,
  disabled = false,
  enableExecutionTracePeek = true,
}: {
  projectId: string;
  evalTemplate: EvalTemplate;
  target: EvalFormType["target"];
  scoreName: EvalFormType["scoreName"];
  disabled?: boolean;
  enableExecutionTracePeek?: boolean;
}) {
  const { isBetaEnabled } = useV4Beta();
  const isSupportedTarget = isCodeEvalTestTarget(target);
  const canPreview = isSupportedTarget && !disabled;
  const previewPointer = useFirstEvalPreviewPointer({
    target,
    useEventsTable: isBetaEnabled,
  });
  const peekNavigationProps = usePeekNavigation({
    queryParams: ["observation", "display", "timestamp"],
    expandConfig: {
      basePath: `/project/${projectId}/traces`,
    },
  });
  const peekConfig = useMemo(
    () => ({
      itemType: "TRACE" as const,
      detailNavigationKey: detailPageListKeys.traces,
      ...peekNavigationProps,
    }),
    [peekNavigationProps],
  );

  const { previewData, isLoading } = usePreviewData({
    projectId,
    enabled: canPreview && Boolean(previewPointer),
    target,
    traceId: previewPointer?.traceId,
    observationId: previewPointer?.observationId,
    timestamp: previewPointer?.timestamp,
  });

  const observationId = previewData?.observationId;
  const traceId = previewData?.traceId;
  const timestamp = previewData?.timestamp;

  const testRunMutation = api.evals.testRunCodeEval.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        return;
      }

      toast.error(result.error.message);
    },
  });

  if (!isSupportedTarget || !canPreview) return null;

  return (
    <>
      <Card className="flex min-w-0 flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm font-bold">Test run</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {evalTemplate.projectId ? (
              <Button asChild variant="outline">
                <Link
                  href={`/project/${projectId}/evals/templates/${evalTemplate.id}?mode=edit`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Source code
                  <ExternalLink className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            ) : (
              <Button
                variant="outline"
                disabled
                title="Only user-managed templates can be edited"
              >
                Source code
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              loading={testRunMutation.isPending}
              disabled={!observationId || isLoading}
              onClick={() => {
                if (!observationId || !traceId) return;

                testRunMutation.mutate({
                  projectId,
                  evalTemplateId: evalTemplate.id,
                  target,
                  mapping: getCodeEvalVariableMapping(),
                  scoreName,
                  observationId,
                  traceId,
                  startTime: timestamp,
                  shouldReadFromObservationsTable: !isBetaEnabled,
                });
              }}
            >
              {testRunMutation.data ? (
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <Play className="mr-1.5 h-3.5 w-3.5" />
              )}
              Test
            </Button>
          </div>
        </div>

        <CodeEvalTestRunInputPreview
          previewData={previewData}
          isLoading={isLoading}
          includeExperimentVariables={target === EvalTargetObject.EXPERIMENT}
        />

        {testRunMutation.data ? (
          <CodeEvalTestRunResultView
            result={testRunMutation.data}
            onShowExecutionTrace={
              enableExecutionTracePeek
                ? (executionTraceId) => {
                    peekConfig.openPeek?.(executionTraceId);
                  }
                : undefined
            }
          />
        ) : null}

        <p className="text-muted-foreground text-xs">
          Read-only preview. Inputs are sampled from the first matching
          observation.
        </p>
      </Card>
      {enableExecutionTracePeek ? (
        <TablePeekViewTraceDetail {...peekConfig} projectId={projectId} />
      ) : null}
    </>
  );
}

function CodeEvalTestRunInputPreview({
  previewData,
  isLoading,
  includeExperimentVariables,
}: {
  previewData: PreviewData | null;
  isLoading: boolean;
  includeExperimentVariables: boolean;
}) {
  if (isLoading) {
    const skeletonCount = includeExperimentVariables ? 5 : 3;
    return (
      <div className="grid gap-2">
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (!previewData) {
    return (
      <div className="text-muted-foreground flex min-h-32 items-center justify-center rounded-md border border-dashed p-4 text-center text-sm">
        No matching observation
      </div>
    );
  }

  return (
    <CodeEvalTestRunInputCards
      previewData={previewData as CodeEvalInputPreviewData}
      includeExperimentVariables={includeExperimentVariables}
    />
  );
}

function CodeEvalTestRunInputCards({
  previewData,
  includeExperimentVariables,
}: {
  previewData: CodeEvalInputPreviewData;
  includeExperimentVariables: boolean;
}) {
  // Mirrors the payload shape buildCodeEvalPayload hands to the evaluator,
  // so the preview shows exactly what the code receives.
  const inputPreviewJson = useMemo(() => {
    const data = previewData.data;

    return {
      observation: {
        input: deepParseJson(data.input),
        output: deepParseJson(data.output),
        metadata: deepParseJson(data.metadata),
        // No deepParseJson, matching variable extraction: the zipped calls are
        // fully parsed already, and it would coerce id/name/type strings that
        // are JSON literals ("true"/"null") into primitives.
        toolCalls: data.toolCalls,
      },
      ...(includeExperimentVariables
        ? {
            experiment: {
              itemExpectedOutput: deepParseJson(
                data.experimentItemExpectedOutput,
              ),
              itemMetadata: deepParseJson(data.experimentItemMetadata),
            },
          }
        : {}),
    };
  }, [includeExperimentVariables, previewData.data]);

  return (
    <div className="bg-muted/20 min-w-0 rounded-md border">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <span className="text-muted-foreground text-xs font-bold">
          Evaluator input
        </span>
      </div>
      <PrettyJsonView
        json={inputPreviewJson}
        currentView="pretty"
        isLoading={false}
        showNullValues={true}
        stickyTopLevelKey={false}
        showObservationTypeBadge={false}
        scrollable={true}
        className="max-h-[40dvh] [&_.border]:border-0 [&_.rounded-sm]:rounded-none"
      />
    </div>
  );
}

function CodeEvalTestRunResultView({
  result,
  onShowExecutionTrace,
}: {
  result: Exclude<CodeEvalTestRunResult, undefined>;
  onShowExecutionTrace?: (executionTraceId: string) => void;
}) {
  const resultJson = result.success
    ? { scores: result.result.scores.map(toUserFacingCodeEvalScore) }
    : { error: result.error };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Badge variant={result.success ? "success" : "error"} className="w-fit">
          {result.success ? "Success" : "Failed"}
        </Badge>
        {onShowExecutionTrace ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onShowExecutionTrace(result.executionTraceId)}
          >
            <ListTree className="mr-1.5 h-3.5 w-3.5" />
            Show execution trace
          </Button>
        ) : null}
      </div>
      <CodeMirrorEditor
        value={JSON.stringify(resultJson, null, 2)}
        editable={false}
        mode="json"
        minHeight={220}
        maxHeight="50dvh"
        className="bg-muted/20 [&_.cm-content]:cursor-default"
      />
    </div>
  );
}

function toUserFacingCodeEvalScore(
  score: CodeEvalTestRunScore,
): Record<string, unknown> {
  const { dataType, value, ...scoreFields } = score;
  const userFacingScore: Record<string, unknown> = {
    ...scoreFields,
    dataType,
    value:
      dataType === "BOOLEAN" && typeof value === "number" ? value === 1 : value,
  };

  return userFacingScore;
}
