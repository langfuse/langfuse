import { EvalTemplateType } from "@langfuse/shared";
import { useState } from "react";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import type { ActivationPreparation } from "@/src/features/evals/v2/fns/requestRuleActivation";
import type { ActivationConfirmationRequest } from "@/src/features/evals/v2/types/rules";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api, type RouterOutputs } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

type Rule = RouterOutputs["evalsV2"]["rules"]["list"]["rules"][number];

export function RuleActiveSwitchCell({
  rule,
  projectId,
  hasWriteAccess,
  requestActivation,
}: {
  rule: Rule;
  projectId: string;
  hasWriteAccess: boolean;
  requestActivation: (
    request: ActivationConfirmationRequest,
  ) => Promise<ActivationPreparation | null>;
}) {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  // Row-local so an estimate in flight for one rule does not freeze the
  // switches of every other row.
  const [isEstimating, setIsEstimating] = useState(false);
  const setEnabled = api.evalsV2.rules.setEnabled.useMutation({
    onError: trpcErrorToast,
    onSuccess: async (_result, variables) => {
      capture("evaluation_rules:status_change", {
        isEnabled: variables.enabled,
        ruleCount: 1,
      });
      await utils.evalsV2.rules.list.invalidate({ projectId });
    },
  });
  const onStatusChange = async (enabled: boolean, sampling?: number) => {
    await setEnabled.mutateAsync({
      projectId,
      ruleId: rule.id,
      enabled,
      ...(sampling === undefined || sampling === rule.sampling
        ? {}
        : { sampling }),
    });
  };

  return (
    <div onClick={(event) => event.stopPropagation()}>
      <Switch
        color="green"
        checked={rule.enabled}
        disabled={!hasWriteAccess || setEnabled.isPending || isEstimating}
        aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.name}`}
        onCheckedChange={(enabled) => {
          if (!hasWriteAccess) return;
          if (!enabled) {
            onStatusChange(false).catch(() => undefined);
            return;
          }
          setIsEstimating(true);
          requestActivation({
            targets: rule.assignments
              .filter(
                ({ evaluator }) =>
                  evaluator.type === EvalTemplateType.LLM_AS_JUDGE,
              )
              .map(({ evaluator }) => ({
                evaluatorId: evaluator.id,
                evaluatorName: evaluator.name,
                filter: rule.filter,
                sampling: rule.sampling,
              })),
            title: "Activate evaluation rule?",
            description:
              "Based on matching observations from the last seven days and the latest evaluator test calls:",
            confirmLabel: "Activate rule",
            onConfirm: (sampling) => onStatusChange(true, sampling),
          })
            .catch(() => undefined)
            .finally(() => setIsEstimating(false));
        }}
      />
    </div>
  );
}
