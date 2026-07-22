import { useState } from "react";

import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  validateAndAttachRule,
  type EvaluationRuleAttachmentValidationIssue,
} from "@/src/features/evals/v2/actions/validateAndAttachRule";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

export type EvaluationRuleAttachmentEntryPoint =
  | "evaluator_detail"
  | "evaluation_rule_detail";

export function useValidatedRuleAttachment({
  projectId,
  entryPoint,
}: {
  projectId: string;
  entryPoint: EvaluationRuleAttachmentEntryPoint;
}) {
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const attachMutation = api.evalsV2.attachEvaluatorToRule.useMutation();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [issue, setIssue] = useState<
    | (EvaluationRuleAttachmentValidationIssue & {
        evaluatorId: string;
        ruleId: string;
      })
    | null
  >(null);

  const attach = async ({
    evaluatorId,
    ruleId,
    evaluatorName,
    evaluationRuleName,
  }: {
    evaluatorId: string;
    ruleId: string;
    evaluatorName: string;
    evaluationRuleName: string;
  }) => {
    const attachmentKey = `${evaluatorId}:${ruleId}`;
    setPendingKey(attachmentKey);
    setIssue(null);
    try {
      const result = await validateAndAttachRule(projectId, {
        getEvaluator: () =>
          utils.client.evals.configById.query({
            projectId,
            id: evaluatorId,
          }),
        getEvaluationRule: () =>
          utils.client.evalsV2.ruleById.query({ projectId, ruleId }),
        getSample: async (filter) => {
          const result = await utils.client.events.all.query({
            projectId,
            filter,
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
        attach: () =>
          attachMutation.mutateAsync({ projectId, evaluatorId, ruleId }),
        captureValidation: ({ outcome, evaluatorType }) =>
          capture("eval_config:run_scope_attachment_validated", {
            outcome,
            evaluatorType,
            // Keep the legacy PostHog dimension stable across the product-language rename.
            entryPoint:
              entryPoint === "evaluation_rule_detail"
                ? "run_scope_detail"
                : entryPoint,
          }),
      });

      if (!result.attached) {
        setIssue({ ...result, evaluatorId, ruleId });
        return false;
      }

      await Promise.all([
        utils.evals.configById.invalidate({ projectId, id: evaluatorId }),
        utils.evalsV2.invalidate(),
      ]);
      showSuccessToast({
        title: "Evaluator attached",
        description: `“${evaluatorName}” is now attached to “${evaluationRuleName}”.`,
      });
      return true;
    } catch (error) {
      trpcErrorToast(error);
      return false;
    } finally {
      setPendingKey(null);
    }
  };

  return { attach, pendingKey, issue };
}
