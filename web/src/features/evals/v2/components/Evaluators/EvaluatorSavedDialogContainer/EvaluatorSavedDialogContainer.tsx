import {
  EvalTemplateType,
  type FilterState,
  type ObservationVariableMapping,
} from "@langfuse/shared";
import { ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { PopoverTrigger } from "@/src/components/ui/popover";
import { EvaluatorSavedDialog } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSavedDialog/EvaluatorSavedDialog";
import { ActivationCostEstimateDetails } from "@/src/features/evals/v2/components/Rules/ActivationConfirmationDialog/components/ActivationCostEstimateDetails/ActivationCostEstimateDetails";
import { CreateRuleDialog } from "@/src/features/evals/v2/components/Rules/CreateRuleDialog/CreateRuleDialog";
import { EvaluationRulePicker } from "@/src/features/evals/v2/components/Rules/EvaluationRulePicker/EvaluationRulePicker";
import { useActivationConfirmation } from "@/src/features/evals/v2/hooks/useActivationConfirmation";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api, type RouterOutputs } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

type Rule = RouterOutputs["evalsV2"]["rules"]["list"]["rules"][number];
type DialogPhase = "saved" | "closing-saved" | "create-rule" | "closed";

export function EvaluatorSavedDialogContainer({
  projectId,
  evaluator,
  onFinish,
}: {
  projectId: string;
  evaluator: {
    id: string;
    name: string;
    type: EvalTemplateType;
    defaultVariableMapping: ObservationVariableMapping[];
    sampleFilter: FilterState;
    hasCompletedTestCall?: boolean;
    testRunCostUsd?: number | null;
  };
  onFinish: () => Promise<void>;
}) {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const activation = useActivationConfirmation({ projectId });
  const [dialogPhase, setDialogPhase] = useState<DialogPhase>("saved");
  const [rulePickerOpen, setRulePickerOpen] = useState(false);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [showCostEstimate, setShowCostEstimate] = useState(false);
  const estimateRequestId = useRef(0);
  const hasRequestedMissingCostTest = useRef(
    evaluator.hasCompletedTestCall ?? false,
  );
  const missingCostTestRequest = useRef<Promise<void> | null>(null);
  const rules = api.evalsV2.rules.list.useQuery(
    // `enabled` in the input filters to active rules — this dialog attaches and
    // runs immediately, so an inactive rule would not evaluate anything. The
    // second `enabled` is react-query's own gate on the request.
    { projectId, page: 1, limit: 100, enabled: true },
    { enabled: dialogPhase === "saved" },
  );
  const availableRules = rules.data?.rules ?? [];
  const selectedRule = availableRules.find(
    (rule) => rule.id === selectedRuleId,
  );
  const attach = api.evalsV2.rules.attach.useMutation({
    onError: trpcErrorToast,
  });

  const finish = async () => {
    await onFinish();
  };

  const attachToRule = async (rule: Rule) => {
    await attach.mutateAsync({
      projectId,
      ruleId: rule.id,
      evaluatorId: evaluator.id,
      variableMapping: null,
    });
    capture("evaluation_rules:attach_evaluator", {
      evaluatorCount: 1,
      source: "evaluator_create",
    });
    await Promise.all([
      utils.evalsV2.rules.list.invalidate({ projectId }),
      utils.evalsV2.rules.listRulesForEvaluator.invalidate({
        projectId,
        evaluatorId: evaluator.id,
      }),
      utils.evalsV2.list.invalidate({ projectId }),
    ]);
    await finish();
  };

  const requestAttach = async (rule = selectedRule) => {
    if (!rule) return;
    const requestId = ++estimateRequestId.current;
    activation.setOpen(false);
    setShowCostEstimate(false);
    setIsEstimating(true);
    try {
      if (missingCostTestRequest.current) {
        await missingCostTestRequest.current;
      }
      if (estimateRequestId.current !== requestId) return;

      const shouldRunMissingTest = !hasRequestedMissingCostTest.current;
      let finishMissingCostTestRequest: (() => void) | undefined;
      if (shouldRunMissingTest) {
        hasRequestedMissingCostTest.current = true;
        missingCostTestRequest.current = new Promise<void>((resolve) => {
          finishMissingCostTestRequest = resolve;
        });
      }

      let result: Awaited<ReturnType<typeof activation.requestActivation>>;
      try {
        result = await activation.requestActivation(
          {
            targets:
              evaluator.type === EvalTemplateType.LLM_AS_JUDGE
                ? [
                    {
                      evaluatorId: evaluator.id,
                      evaluatorName: evaluator.name,
                      filter: rule.filter,
                      sampling: rule.sampling,
                    },
                  ]
                : [],
            title: "Attach evaluator to rule?",
            description:
              "Based on matching observations from the last seven days and the latest evaluator test call:",
            confirmLabel: "Attach and run",
            onConfirm: () => attachToRule(rule),
          },
          {
            shouldRunMissingTest,
            ...(evaluator.testRunCostUsd !== null &&
            evaluator.testRunCostUsd !== undefined
              ? { knownTestRunCostUsd: evaluator.testRunCostUsd }
              : {}),
          },
        );
      } finally {
        finishMissingCostTestRequest?.();
        if (shouldRunMissingTest) missingCostTestRequest.current = null;
      }
      if (result?.matchingObservations === 0) {
        hasRequestedMissingCostTest.current = false;
      }
      if (estimateRequestId.current !== requestId) return;
      setShowCostEstimate(Boolean(result));
    } finally {
      if (estimateRequestId.current === requestId) setIsEstimating(false);
    }
  };

  const openCreateRule = () => {
    setDialogPhase("closing-saved");
  };

  const completeCreateRuleHandoff = () => {
    setDialogPhase("closed");
    window.requestAnimationFrame(() => setDialogPhase("create-rule"));
  };

  const handlePrimaryAction = () => {
    if (selectedRuleId === null) {
      openCreateRule();
      return;
    }
    if (!selectedRule) return;
    if (evaluator.type === EvalTemplateType.LLM_AS_JUDGE && showCostEstimate) {
      attachToRule(selectedRule).catch(() => undefined);
      return;
    }
    estimateRequestId.current += 1;
    setIsEstimating(false);
    attachToRule(selectedRule).catch(() => undefined);
  };

  return dialogPhase === "saved" || dialogPhase === "closing-saved" ? (
    <EvaluatorSavedDialog
      open={dialogPhase === "saved"}
      onOpenChange={(open) => {
        if (!open) {
          setDialogPhase("closed");
          finish().catch(() => undefined);
        }
      }}
      canSubmit={selectedRuleId === null || Boolean(selectedRule)}
      costEstimate={
        showCostEstimate && selectedRule ? (
          <ActivationCostEstimateDetails
            estimates={activation.estimate.estimates}
            unavailableEstimateCount={
              activation.estimate.unavailableEstimateCount
            }
            matchingObservations={activation.estimate.matchingObservations}
            sampling={activation.estimate.sampling ?? selectedRule.sampling}
          />
        ) : null
      }
      isAttaching={attach.isPending}
      isEstimating={isEstimating}
      primaryActionLabel={
        selectedRuleId === null ? "Create rule" : "Attach and run"
      }
      onPrimaryAction={handlePrimaryAction}
      onCloseAnimationEnd={completeCreateRuleHandoff}
      rulePicker={
        <EvaluationRulePicker
          open={rulePickerOpen}
          onOpenChange={setRulePickerOpen}
          disabledRules={[]}
          availableRules={availableRules}
          loading={rules.isPending}
          onSelectAvailableRule={(rule) => {
            setSelectedRuleId(rule.id);
            if (evaluator.type === EvalTemplateType.LLM_AS_JUDGE) {
              requestAttach(rule).catch(() => undefined);
            }
          }}
          onCreateRule={() => {
            estimateRequestId.current += 1;
            activation.setOpen(false);
            setSelectedRuleId(null);
            setShowCostEstimate(false);
            setIsEstimating(false);
          }}
        >
          {() => (
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-between font-normal"
              >
                <span
                  className="truncate"
                  title={selectedRule?.name ?? "Create new rule"}
                >
                  {selectedRule?.name ?? "Create new rule"}
                </span>
                <ChevronDown className="text-muted-foreground h-4 w-4 shrink-0" />
              </Button>
            </PopoverTrigger>
          )}
        </EvaluationRulePicker>
      }
    />
  ) : dialogPhase === "create-rule" ? (
    <CreateRuleDialog
      projectId={projectId}
      open
      onOpenChange={(open) => {
        if (!open) {
          setDialogPhase("closed");
          finish().catch(() => undefined);
        }
      }}
      initialEvaluator={evaluator}
      initialFilter={
        evaluator.sampleFilter.length ? evaluator.sampleFilter : undefined
      }
    />
  ) : null;
}
