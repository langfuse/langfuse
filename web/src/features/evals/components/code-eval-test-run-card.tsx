import { CodeMirrorEditor } from "@/src/components/editor";
import { TablePeekViewTraceDetail } from "@/src/components/table/peek/peek-trace-detail";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useExtractVariables } from "@/src/features/evals/hooks/useExtractVariables";
import {
  type PreviewData,
  usePreviewData,
} from "@/src/features/evals/hooks/usePreviewData";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { api, type RouterOutputs } from "@/src/utils/api";
import { EvalTargetObject, type EvalTemplate } from "@langfuse/shared";
import { ListTree, Play, RotateCcw } from "lucide-react";
import { useMemo } from "react";
import { type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

import { type EvalFormType } from "@/src/features/evals/utils/evaluator-form-utils";
import { getCodeEvalVariableMapping } from "@/src/features/evals/utils/code-eval-template-utils";
import { isEventTarget } from "@/src/features/evals/utils/typeHelpers";

type CodeEvalTestRunResult =
  | RouterOutputs["evals"]["testRunCodeEval"]
  | undefined;

const codeEvalObservationVariables = [
  { variable: "input", label: "observation.input" },
  { variable: "output", label: "observation.output" },
  { variable: "metadata", label: "observation.metadata" },
];

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
  const canTest = isBetaEnabled && isEventTarget(target) && !disabled;
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
    canTest,
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

  if (!canTest) return null;

  return (
    <>
      <Card className="flex min-w-0 flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">Test run</span>
          <Button
            type="button"
            variant="outline"
            loading={testRunMutation.isPending}
            disabled={!observationId || isLoading}
            onClick={() => {
              if (!observationId) return;

              testRunMutation.mutate({
                projectId,
                evalTemplateId: evalTemplate.id,
                target: EvalTargetObject.EVENT,
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
        </div>

        <CodeEvalTestRunInputPreview
          previewData={previewData}
          isLoading={isLoading}
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
}: {
  previewData: PreviewData | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-2">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
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

  return <CodeEvalTestRunInputCards previewData={previewData} />;
}

function CodeEvalTestRunInputCards({
  previewData,
}: {
  previewData: PreviewData;
}) {
  const variableMapping = useMemo(
    () =>
      getCodeEvalVariableMapping().filter((mapping) =>
        codeEvalObservationVariables.some(
          (variable) => variable.variable === mapping.templateVariable,
        ),
      ),
    [],
  );
  const variables = useMemo(
    () => variableMapping.map((mapping) => mapping.templateVariable),
    [variableMapping],
  );
  const { extractedVariables, isExtracting } = useExtractVariables({
    variables,
    variableMapping,
    previewData,
    isLoading: false,
  });

  if (isExtracting) {
    return (
      <div className="grid gap-2">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {codeEvalObservationVariables.map((variable) => {
        const value =
          extractedVariables.find(
            (extracted) => extracted.variable === variable.variable,
          )?.value ?? "n/a";

        return (
          <div
            key={variable.variable}
            className="bg-muted/30 min-w-0 rounded-md border p-3"
          >
            <div className="text-muted-foreground font-mono text-xs">
              {variable.label}
            </div>
            <pre className="mt-2 max-h-28 overflow-auto text-xs wrap-break-word whitespace-pre-wrap">
              {value}
            </pre>
          </div>
        );
      })}
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
      />
    </div>
  );
}
