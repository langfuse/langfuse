import { useState } from "react";

import {
  validateRuleAttachment,
  type EvaluationRuleAttachmentValidationIssue,
} from "@/src/features/evals/v2/actions/validateAndAttachRule";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { type FilterState } from "@langfuse/shared";

export function useValidatedRuleDraftEvaluator({
  projectId,
}: {
  projectId: string;
}) {
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const [pendingEvaluatorId, setPendingEvaluatorId] = useState<string | null>(
    null,
  );
  const [issue, setIssue] = useState<
    (EvaluationRuleAttachmentValidationIssue & { evaluatorId: string }) | null
  >(null);

  const validate = async ({
    evaluatorId,
    filter,
  }: {
    evaluatorId: string;
    filter: FilterState;
  }) => {
    setPendingEvaluatorId(evaluatorId);
    setIssue(null);
    try {
      const result = await validateRuleAttachment(projectId, {
        getEvaluator: () =>
          utils.client.evals.configById.query({
            projectId,
            id: evaluatorId,
          }),
        getEvaluationRule: async () => ({
          filter,
          targetObject: "event",
        }),
        getSample: async (ruleFilter) => {
          const result = await utils.client.events.all.query({
            projectId,
            filter: ruleFilter,
            searchQuery: null,
            searchType: [],
            orderBy: { column: "startTime", order: "DESC" },
            page: 1,
            limit: 1,
          });
          return result.observations[0] ?? null;
        },
        runCodeTest: (input) =>
          utils.client.evalsV2.testRunCodeEval.mutate({
            ...input,
            projectId,
          }),
        runLlmTest: (input) =>
          utils.client.evalsV2.testRunLlmJudge.mutate(input),
        captureValidation: ({ outcome, evaluatorType }) =>
          capture("eval_config:run_scope_attachment_validated", {
            outcome,
            evaluatorType,
            entryPoint: "run_scope_create",
          }),
      });

      if (!result.valid) {
        setIssue({ ...result, evaluatorId });
        return false;
      }
      return true;
    } catch (error) {
      trpcErrorToast(error);
      return false;
    } finally {
      setPendingEvaluatorId(null);
    }
  };

  return {
    validate,
    pendingEvaluatorId,
    issue,
    resetIssue: () => setIssue(null),
  };
}
