import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { ArrowLeft } from "lucide-react";

import { TablePeekView } from "@/src/components/table/peek";
import { usePeekData } from "@/src/components/table/peek/hooks/usePeekData";
import {
  TraceDetailBody,
  traceDetailTitle,
} from "@/src/components/trace/TraceDetailBody";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { DeleteEvaluationRuleButton } from "@/src/features/evals/v2/components/DeleteEvaluationRuleButton";
import { EvaluationRuleEditView } from "@/src/features/evals/v2/components/EvaluationRuleEditView";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { api } from "@/src/utils/api";
import { toAbsoluteTimeRange } from "@/src/utils/date-range-utils";

export function TablePeekViewEvaluationRuleDetail({
  projectId,
  ...peekProps
}: Omit<React.ComponentProps<typeof TablePeekView>, "children" | "title"> & {
  projectId: string;
}) {
  const router = useRouter();
  const ruleId = router.query.peek as string | undefined;
  const mappingEvaluatorId = router.query.mappingEvaluatorId as
    | string
    | undefined;
  const [inspectedTraceId, setInspectedTraceId] = useState<string | null>(null);
  const [formResetKey, setFormResetKey] = useState(0);
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:CUD",
  });
  const evaluationRule = api.evalsV2.ruleById.useQuery(
    { projectId, ruleId: ruleId ?? "" },
    { enabled: Boolean(projectId && ruleId) },
  );
  const inspectedTrace = usePeekData({
    projectId,
    traceId: inspectedTraceId ?? undefined,
  });
  const { timeRange } = useTableDateRange(projectId);
  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange),
    [timeRange],
  );

  const ruleActions =
    hasWriteAccess && evaluationRule.data ? (
      <DeleteEvaluationRuleButton
        projectId={projectId}
        evaluationRule={{
          id: evaluationRule.data.id,
          name: evaluationRule.data.name,
          evaluatorCount: evaluationRule.data.evaluators.length,
        }}
        variant="ghost"
        iconOnly
        onDeleted={peekProps.closePeek}
      />
    ) : undefined;
  const inspectedTraceActions = inspectedTraceId ? (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label="Back to evaluation rule"
      onClick={() => setInspectedTraceId(null)}
    >
      <ArrowLeft className="h-4 w-4" />
    </Button>
  ) : undefined;
  const ruleActionsMenu =
    hasWriteAccess && evaluationRule.data ? (
      <div className="flex w-full flex-col gap-0.5">
        <DeleteEvaluationRuleButton
          projectId={projectId}
          evaluationRule={{
            id: evaluationRule.data.id,
            name: evaluationRule.data.name,
            evaluatorCount: evaluationRule.data.evaluators.length,
          }}
          size="sm"
          className="w-full justify-start font-normal"
          onDeleted={peekProps.closePeek}
        />
      </div>
    ) : undefined;

  return (
    <TablePeekView
      {...peekProps}
      closePeek={
        inspectedTraceId ? () => setInspectedTraceId(null) : peekProps.closePeek
      }
      title={
        inspectedTraceId
          ? traceDetailTitle(inspectedTrace.data, inspectedTraceId)
          : (evaluationRule.data?.name ?? "Evaluation rule")
      }
      actions={inspectedTraceId ? inspectedTraceActions : ruleActions}
      actionsMenu={inspectedTraceId ? undefined : ruleActionsMenu}
    >
      {inspectedTraceId ? (
        <TraceDetailBody trace={inspectedTrace.data} context="peek" />
      ) : evaluationRule.isError ? (
        <p className="text-muted-foreground p-4 text-sm">
          This evaluation rule could not be loaded.
        </p>
      ) : evaluationRule.isPending || !evaluationRule.data ? (
        <div className="flex flex-col gap-4 p-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-52 w-full" />
        </div>
      ) : (
        <EvaluationRuleEditView
          key={`${evaluationRule.data.id}-${mappingEvaluatorId ?? "default"}-${formResetKey}`}
          projectId={projectId}
          evaluationRule={evaluationRule.data}
          timeRange={absoluteTimeRange}
          onCancel={peekProps.closePeek}
          onSaved={() => setFormResetKey((key) => key + 1)}
          onOpenTrace={setInspectedTraceId}
          readOnly={!hasWriteAccess}
          initialExpandedEvaluatorId={mappingEvaluatorId}
        />
      )}
    </TablePeekView>
  );
}
