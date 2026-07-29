import { useState } from "react";

import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  validateAndAttachRule,
  type EvaluationRuleAttachmentValidationIssue,
} from "@/src/features/evals/v2/actions/validateAndAttachRule";
import { getLatestRuleSample } from "@/src/features/evals/v2/actions/getLatestRuleSample";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

export type EvaluationRuleAttachmentEntryPoint =
  | "evaluator_detail"
  | "evaluator_overview"
  | "evaluation_rule_detail";

type AttachmentInput = {
  evaluatorId: string;
  ruleId: string;
  evaluatorName: string;
  evaluationRuleName: string;
};

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
        evaluatorId: AttachmentInput["evaluatorId"];
        ruleId: AttachmentInput["ruleId"];
        evaluatorName: AttachmentInput["evaluatorName"];
        evaluationRuleName: AttachmentInput["evaluationRuleName"];
      })
    | null
  >(null);

  const handleAttached = async ({
    evaluatorId,
    evaluatorName,
    evaluationRuleName,
  }: AttachmentInput) => {
    setIssue(null);
    await Promise.all([
      utils.evals.configById.invalidate({ projectId, id: evaluatorId }),
      utils.evalsV2.invalidate(),
    ]);
    showSuccessToast({
      title: "Evaluator attached",
      description: `“${evaluatorName}” is now attached to “${evaluationRuleName}”.`,
    });
  };

  const attach = async (input: AttachmentInput) => {
    const { evaluatorId, ruleId } = input;
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
        getSample: (filter) =>
          getLatestRuleSample(filter, {
            getLatest: async (ruleFilter) => {
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
            getDetails: (sample) =>
              utils.client.evalsV2.sampleObservation.query({
                projectId,
                observationId: sample.id,
                traceId: sample.traceId,
                startTime: sample.startTime,
              }),
          }),
        runCodeTest: (input) =>
          utils.client.evalsV2.testRunCodeEval.mutate({
            ...input,
            projectId,
          }),
        attach: async () => {
          await attachMutation.mutateAsync({ projectId, evaluatorId, ruleId });
          await handleAttached(input);
        },
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

      if (result.issue) {
        const enrichedIssue = {
          ...result.issue,
          ...input,
        };
        setIssue(enrichedIssue);
        return { attached: true as const, issue: enrichedIssue };
      }

      setIssue(null);
      return { attached: true as const };
    } catch (error) {
      trpcErrorToast(error);
      return { attached: false as const };
    } finally {
      setPendingKey(null);
    }
  };

  return {
    attach,
    dismissIssue: () => setIssue(null),
    pendingKey,
    issue,
  };
}
