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
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { api, type RouterOutputs } from "@/src/utils/api";
import {
  deepParseJson,
  EvalTargetObject,
  extractValueFromObject,
  type EvalTemplate,
} from "@langfuse/shared";
import { ListTree, Lock, Play, RotateCcw } from "lucide-react";
import { useMemo } from "react";
import { type UseFormReturn } from "react-hook-form";
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

export function CodeEvalTestRunCard({
  projectId,
  evalTemplate,
  form,
  disabled = false,
}: {
  projectId: string;
  evalTemplate: EvalTemplate;
  form: UseFormReturn<EvalFormType>;
  disabled?: boolean;
}) {
  const { isBetaEnabled } = useV4Beta();
  const target = form.watch("target");
  const scoreName = form.watch("scoreName");
  const testTarget = isEventTarget(target)
    ? EvalTargetObject.EVENT
    : isExperimentTarget(target)
      ? EvalTargetObject.EXPERIMENT
      : null;
  const canPreview = isBetaEnabled && Boolean(testTarget) && !disabled;
  const canTest = canPreview && Boolean(testTarget);
  const peekNavigationProps = usePeekNavigation({
    queryParams: ["observation", "display", "timestamp"],
    expandConfig: {
      basePath: `/project/${projectId}/traces`,
    },
  });
  const peekConfig = useMemo(
    () => ({
      itemType: "TRACE" as const,
      detailNavigationKey: "traces",
      ...peekNavigationProps,
    }),
    [peekNavigationProps],
  );

  const { previewData, isLoading } = usePreviewData(
    projectId,
    form,
    canPreview,
    undefined,
    undefined,
  );

  const observationId =
    previewData?.type === EvalTargetObject.EVENT
      ? previewData.observationId
      : undefined;

  const testRunMutation = api.evals.testRunCodeEval.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        return;
      }

      toast.error(result.error.message);
    },
  });

  if (!canPreview) return null;

  return (
    <>
      <Card className="flex min-w-0 flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm font-medium">Test run</span>
            <Badge variant="outline" className="gap-1">
              <Lock className="h-3 w-3" />
              Read-only preview
            </Badge>
          </div>
          {canTest ? (
            <Button
              type="button"
              variant="outline"
              loading={testRunMutation.isPending}
              disabled={!observationId || isLoading}
              onClick={() => {
                if (!observationId || !testTarget) return;

                testRunMutation.mutate({
                  projectId,
                  evalTemplateId: evalTemplate.id,
                  target: testTarget,
                  mapping: getCodeEvalVariableMapping(),
                  scoreName,
                  observationId,
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
          ) : null}
        </div>

        <CodeEvalTestRunInputPreview
          previewData={previewData}
          isLoading={isLoading}
          includeExperimentVariables={
            testTarget === EvalTargetObject.EXPERIMENT
          }
        />

        {testRunMutation.data ? (
          <CodeEvalTestRunResultView
            result={testRunMutation.data}
            onShowExecutionTrace={(executionTraceId) => {
              peekConfig.openPeek?.(executionTraceId);
            }}
          />
        ) : null}
      </Card>
      <TablePeekViewTraceDetail {...peekConfig} projectId={projectId} />
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
      previewData={previewData}
      includeExperimentVariables={includeExperimentVariables}
    />
  );
}

function CodeEvalTestRunInputCards({
  previewData,
  includeExperimentVariables,
}: {
  previewData: PreviewData;
  includeExperimentVariables: boolean;
}) {
  const inputPreviewJson = useMemo(() => {
    const data = previewData.data as Record<string, unknown> | undefined;
    const getValue = (selectedColumnId: string) => {
      if (!data) return null;

      const { value } = extractValueFromObject(data, selectedColumnId);
      return value === undefined ? null : deepParseJson(value);
    };

    return {
      observation: {
        input: getValue("input"),
        output: getValue("output"),
        metadata: getValue("metadata"),
      },
      ...(includeExperimentVariables
        ? {
            experiment: {
              expectedOutput: getValue("experimentItemExpectedOutput"),
              itemMetadata: getValue("experimentItemMetadata"),
            },
          }
        : {}),
    };
  }, [includeExperimentVariables, previewData.data]);

  return (
    <div className="bg-muted/20 min-w-0 rounded-md border">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <span className="text-muted-foreground text-xs font-medium">
          Evaluator input
        </span>
        <Badge variant="outline" className="gap-1">
          <Lock className="h-3 w-3" />
          Read-only
        </Badge>
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
  onShowExecutionTrace: (executionTraceId: string) => void;
}) {
  const resultJson = result.success
    ? { scores: result.result.scores }
    : { error: result.error };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Badge variant={result.success ? "success" : "error"} className="w-fit">
          {result.success ? "Success" : "Failed"}
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onShowExecutionTrace(result.executionTraceId)}
        >
          <ListTree className="mr-1.5 h-3.5 w-3.5" />
          Show execution trace
        </Button>
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
