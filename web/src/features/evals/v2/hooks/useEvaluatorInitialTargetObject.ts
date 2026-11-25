import {
  isTraceTranscriptEvalType,
  TopicsTargetObject,
  type EvalTemplateType,
} from "@langfuse/shared";

import { useCanViewTraceTranscriptsEvals } from "@/src/features/evals/transcriptEvalsAccess";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api, shouldRetryResourceQuery } from "@/src/utils/api";

/** An evaluator linked only to trace rules opens its test on Trace messages. */
export function useEvaluatorInitialTargetObject({
  projectId,
  evaluatorId,
  evaluatorType,
}: {
  projectId: string;
  evaluatorId: string;
  evaluatorType: EvalTemplateType | undefined;
}) {
  const traceEvalsAvailable = useCanViewTraceTranscriptsEvals(projectId);
  const canReadRules = useHasProjectAccess({
    projectId,
    scope: "evaluationRule:read",
  });
  const enabled = Boolean(
    projectId && evaluatorId && traceEvalsAvailable && canReadRules,
  );
  const assignments = api.evalsV2.rules.listRulesForEvaluator.useQuery(
    { projectId, evaluatorId },
    { enabled, retry: shouldRetryResourceQuery },
  );

  const linkedOnlyToTraceRules =
    evaluatorType !== undefined &&
    isTraceTranscriptEvalType(evaluatorType) &&
    assignments.data !== undefined &&
    assignments.data.length > 0 &&
    assignments.data.every(
      (assignment) =>
        assignment.evaluationRule.targetObject === TopicsTargetObject,
    );

  return {
    isPending: enabled && assignments.isPending,
    initialTargetObject: linkedOnlyToTraceRules
      ? TopicsTargetObject
      : undefined,
  };
}
