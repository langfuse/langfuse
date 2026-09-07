/* eslint-disable @repo/no-null-render */
import {
  EvalTemplateType,
  EvalTargetObject,
  type FilterState,
  type ObservationVariableMapping,
} from "@langfuse/shared";
import { ChevronDown } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { PopoverTrigger } from "@/src/components/ui/popover";
import { selectTriggerClassName } from "@/src/components/ui/select";
import {
  EvaluatorSavedDialog,
  type EvaluatorSavedMode,
} from "@/src/features/evals/v2/components/Evaluators/EvaluatorSavedDialog/EvaluatorSavedDialog";
import { EvaluatorSavedCostSummary } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSavedDialog/EvaluatorSavedCostSummary";
import { CreateRuleDialog } from "@/src/features/evals/v2/components/Rules/CreateRuleDialog/CreateRuleDialog";
import { EvaluationRulePicker } from "@/src/features/evals/v2/components/Rules/EvaluationRulePicker/EvaluationRulePicker";
import { RuleFilterPills } from "@/src/features/evals/v2/components/Rules/RuleFilterPills/RuleFilterPills";
import { useActivationConfirmation } from "@/src/features/evals/v2/hooks/useActivationConfirmation";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api, type RouterOutputs } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { cn } from "@/src/utils/tailwind";
import { classifySampleFiltersForRule } from "@/src/features/evals/v2/fns/rules/classifySampleFiltersForRule";
import { EvaluatorSavedRuleFilterPreview } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSavedDialog/EvaluatorSavedRuleFilterPreview";
import { EvaluatorBackfillSettings } from "@/src/features/evals/v2/components/Evaluators/EvaluatorBackfillSettings/EvaluatorBackfillSettings";
import { useEvaluatorSavedBackfill } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSavedDialogContainer/hooks/useEvaluatorSavedBackfill";

type Rule = RouterOutputs["evalsV2"]["rules"]["list"]["rules"][number];
type DialogPhase = "saved" | "closing-saved" | "create-rule" | "closed";

type EvaluatorSavedDialogEvaluator = {
  id: string;
  name: string;
  type: EvalTemplateType;
  defaultVariableMapping: ObservationVariableMapping[];
  sampleFilter: FilterState;
  hasCompletedTestCall?: boolean;
  testRunCostUsd?: number | null;
};

export function EvaluatorSavedDialogContainer({
  projectId,
  evaluator,
  onDismiss,
  onFinish,
}: {
  projectId: string;
  evaluator: EvaluatorSavedDialogEvaluator;
  onDismiss: () => Promise<void>;
  onFinish: () => Promise<void>;
}) {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const activation = useActivationConfirmation({ projectId });
  const requestActivation = activation.requestActivation;
  const setActivationOpen = activation.setOpen;
  const setActivationSampling = activation.setSampling;
  const [dialogPhase, setDialogPhase] = useState<DialogPhase>("saved");
  const [mode, setMode] = useState<EvaluatorSavedMode>("test-filters");
  const [rulePickerOpen, setRulePickerOpen] = useState(false);
  const [selectedRuleId, setSelectedRuleId] = useState<
    string | null | undefined
  >(undefined);
  const [isEstimating, setIsEstimating] = useState(false);
  const [testFilterSampling, setTestFilterSampling] = useState(1);
  const [isCompleting, setIsCompleting] = useState(false);
  const estimateRequestId = useRef(0);
  const initialEstimateRequested = useRef(false);
  const createRuleHandoffPending = useRef(false);
  const hasRequestedMissingCostTest = useRef(
    evaluator.hasCompletedTestCall ?? false,
  );
  const missingCostTestRequest = useRef<Promise<void> | null>(null);
  const activeRules = api.evalsV2.rules.list.useQuery(
    {
      projectId,
      page: 1,
      limit: 100,
      enabled: true,
      targetObjects: [EvalTargetObject.EVENT, EvalTargetObject.EXPERIMENT],
    },
    { enabled: dialogPhase === "saved" },
  );
  const inactiveRules = api.evalsV2.rules.list.useQuery(
    {
      projectId,
      page: 1,
      limit: 100,
      enabled: false,
      targetObjects: [EvalTargetObject.EVENT, EvalTargetObject.EXPERIMENT],
    },
    { enabled: dialogPhase === "saved" },
  );
  const historicEvaluationLimit = api.evals.globalJobConfigs.useQuery({
    projectId,
  });
  const backfill = useEvaluatorSavedBackfill({
    projectId,
    evaluatorId: evaluator.id,
    historicEvaluationLimit: historicEvaluationLimit.data,
  });
  const availableRules = useMemo(
    () =>
      [
        ...(activeRules.data?.rules ?? []),
        ...(inactiveRules.data?.rules ?? []),
      ].sort(
        (left, right) => right.assignments.length - left.assignments.length,
      ),
    [activeRules.data?.rules, inactiveRules.data?.rules],
  );
  const rulesPending = activeRules.isPending || inactiveRules.isPending;
  const {
    supportedFilters: supportedRuleFilters,
    unsupportedReasons: unsupportedRuleFilterReasons,
  } = useMemo(
    () => classifySampleFiltersForRule(evaluator.sampleFilter),
    [evaluator.sampleFilter],
  );
  const selectedRule = availableRules.find(
    (rule) => rule.id === selectedRuleId,
  );
  const attach = api.evalsV2.rules.attach.useMutation({
    onError: trpcErrorToast,
  });
  const createOrAttachFromEvaluatorFilters =
    api.evalsV2.rules.createOrAttachFromEvaluatorFilters.useMutation({
      onError: trpcErrorToast,
    });

  const finish = async () => {
    await onFinish();
  };

  const invalidateRuleQueries = async () => {
    await Promise.all([
      utils.evalsV2.rules.list.invalidate({ projectId }),
      utils.evalsV2.rules.filterOptions.invalidate({ projectId }),
      utils.evalsV2.rules.listRulesForEvaluator.invalidate({
        projectId,
        evaluatorId: evaluator.id,
      }),
      utils.evalsV2.list.invalidate({ projectId }),
    ]);
  };

  const attachToRule = async (rule: Rule) => {
    const currentAssignments =
      await utils.client.evalsV2.rules.listRulesForEvaluator.query({
        projectId,
        evaluatorId: evaluator.id,
      });
    const isAlreadyAttached = currentAssignments.some(
      (assignment) => assignment.evaluationRule.id === rule.id,
    );
    if (!isAlreadyAttached) {
      await attach.mutateAsync({
        projectId,
        ruleId: rule.id,
        evaluatorId: evaluator.id,
        variableMapping: null,
        enableRule: !rule.enabled,
      });
      capture("evaluation_rules:attach_evaluator", {
        evaluatorCount: 1,
        source: "evaluator_create",
      });
    }
    const currentRule = await utils.client.evalsV2.rules.get.query({
      projectId,
      ruleId: rule.id,
    });
    await backfill.schedule(
      { filter: currentRule.filter, sampling: currentRule.sampling },
      backfill.executionRange,
    );
    await invalidateRuleQueries();
    await finish();
  };

  const resolveFromTestFilters = async () => {
    const sampling = testFilterSampling;
    const result = await createOrAttachFromEvaluatorFilters.mutateAsync({
      projectId,
      evaluatorId: evaluator.id,
      filter: supportedRuleFilters,
      sampling,
    });
    if (result.action === "created") {
      capture("evaluation_rules:create", {
        assignmentCount: 1,
        filterCount: supportedRuleFilters.length,
        samplingPercent: Math.round(sampling * 100),
        isEnabled: true,
        source: "evaluator_create_test_filters",
      });
    } else {
      capture("evaluation_rules:attach_evaluator", {
        evaluatorCount: 1,
        source: "evaluator_create_test_filters",
      });
    }
    await backfill.schedule(
      { filter: supportedRuleFilters, sampling },
      backfill.executionRange,
    );
    await invalidateRuleQueries();
    await finish();
  };

  const requestEstimate = useCallback(
    async ({ filter, sampling }: { filter: FilterState; sampling: number }) => {
      const requestId = ++estimateRequestId.current;
      setActivationOpen(false);
      // Stay in the loading state for the whole request: the numbers on screen
      // belong to the previous scope, so a rule switch must not show the old
      // match count and cost under the newly selected rule.
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

        let result: Awaited<ReturnType<typeof requestActivation>>;
        try {
          result = await requestActivation(
            {
              targets: [
                {
                  evaluatorId: evaluator.id,
                  evaluatorName: evaluator.name,
                  filter,
                  sampling,
                },
              ],
              title: "Review evaluator cost",
              description: "",
              confirmLabel: "Continue",
              onConfirm: async () => undefined,
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
        if (estimateRequestId.current !== requestId) return;
        if (result?.matchingObservations === 0) {
          hasRequestedMissingCostTest.current = false;
        }
      } finally {
        if (estimateRequestId.current === requestId) setIsEstimating(false);
      }
    },
    [
      evaluator.id,
      evaluator.name,
      evaluator.testRunCostUsd,
      requestActivation,
      setActivationOpen,
    ],
  );

  const requestInitialEstimate = () => {
    if (initialEstimateRequested.current) return;
    initialEstimateRequested.current = true;
    requestEstimate({
      filter: supportedRuleFilters,
      sampling: testFilterSampling,
    }).catch(() => undefined);
  };

  const openCreateRule = () => {
    createRuleHandoffPending.current = true;
    setDialogPhase("closing-saved");
  };

  const completeCreateRuleHandoff = () => {
    if (!createRuleHandoffPending.current) return;
    createRuleHandoffPending.current = false;
    setDialogPhase("closed");
    window.requestAnimationFrame(() => setDialogPhase("create-rule"));
  };

  const selectExistingRule = useCallback(
    (rule: Rule) => {
      setSelectedRuleId(rule.id);
      setActivationSampling(rule.sampling);
      requestEstimate({ filter: rule.filter, sampling: rule.sampling }).catch(
        () => undefined,
      );
      if (backfill.enabled) {
        backfill
          .requestEstimate({ filter: rule.filter, sampling: rule.sampling })
          .catch(() => undefined);
      }
    },
    [backfill, requestEstimate, setActivationSampling],
  );

  const selectNewRule = () => {
    estimateRequestId.current += 1;
    setActivationOpen(false);
    setIsEstimating(false);
    setSelectedRuleId(null);
    backfill.clearScope();
  };

  const handleModeChange = (nextMode: EvaluatorSavedMode) => {
    const modeChangeRequestId = ++estimateRequestId.current;
    setActivationOpen(false);
    setIsEstimating(false);
    setMode(nextMode);

    if (nextMode === "different-scope") {
      const selectMostUsedRule = (rules: Rule[]) => {
        if (estimateRequestId.current !== modeChangeRequestId) return;
        const mostUsedRule = rules[0];
        if (mostUsedRule) {
          selectExistingRule(mostUsedRule);
          return;
        }
        setSelectedRuleId(null);
        backfill.clearScope();
      };

      if (rulesPending) {
        setSelectedRuleId(undefined);
        Promise.all([activeRules.refetch(), inactiveRules.refetch()])
          .then(([activeResult, inactiveResult]) =>
            selectMostUsedRule(
              [
                ...(activeResult.data?.rules ?? []),
                ...(inactiveResult.data?.rules ?? []),
              ].sort(
                (left, right) =>
                  right.assignments.length - left.assignments.length,
              ),
            ),
          )
          .catch(() => selectMostUsedRule([]));
        return;
      }

      selectMostUsedRule(availableRules);
      return;
    }

    setSelectedRuleId(undefined);
    setActivationSampling(testFilterSampling);
    requestEstimate({
      filter: supportedRuleFilters,
      sampling: testFilterSampling,
    }).catch(() => undefined);
    if (backfill.enabled) {
      backfill
        .requestEstimate({
          filter: supportedRuleFilters,
          sampling: testFilterSampling,
        })
        .catch(() => undefined);
    }
  };

  const currentBackfillScope =
    mode === "test-filters"
      ? { filter: supportedRuleFilters, sampling: testFilterSampling }
      : selectedRule
        ? { filter: selectedRule.filter, sampling: selectedRule.sampling }
        : null;

  const handlePrimaryAction = () => {
    if (mode === "test-filters") {
      capture("evaluators:saved_dialog_submit", {
        action: "test_filters",
        hasBackfill: backfill.enabled,
        backfillWindow: backfill.enabled ? backfill.window : undefined,
        backfillMaxItems: backfill.enabled
          ? backfill.effectiveMaxItems
          : undefined,
      });
      setIsCompleting(true);
      resolveFromTestFilters().catch(() => setIsCompleting(false));
      return;
    }
    if (selectedRule) {
      capture("evaluators:saved_dialog_submit", {
        action: "existing_rule",
        hasBackfill: backfill.enabled,
        backfillWindow: backfill.enabled ? backfill.window : undefined,
        backfillMaxItems: backfill.enabled
          ? backfill.effectiveMaxItems
          : undefined,
      });
      setIsCompleting(true);
      attachToRule(selectedRule).catch(() => setIsCompleting(false));
    } else {
      capture("evaluators:saved_dialog_submit", {
        action: "new_rule",
        hasBackfill: false,
      });
      openCreateRule();
    }
  };

  const rulePicker = (
    <EvaluationRulePicker
      open={rulePickerOpen}
      onOpenChange={setRulePickerOpen}
      disabledRules={[]}
      availableRules={availableRules}
      loading={rulesPending}
      onSelectAvailableRule={selectExistingRule}
      onCreateRule={selectNewRule}
    >
      {() => (
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(selectTriggerClassName, "w-full min-w-0")}
          >
            <span
              className="truncate"
              title={
                selectedRule?.name ??
                (selectedRuleId === null ? "New rule" : "Select a rule")
              }
            >
              {selectedRule?.name ??
                (selectedRuleId === null ? "New rule" : "Select a rule")}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
      )}
    </EvaluationRulePicker>
  );

  const modeContentByMode = {
    "test-filters": (
      <EvaluatorSavedRuleFilterPreview
        filter={evaluator.sampleFilter}
        unsupportedReasons={unsupportedRuleFilterReasons}
      />
    ),
    "different-scope": (
      <div className="min-w-0 space-y-3">
        {rulePicker}
        {selectedRule ? (
          <>
            <RuleFilterPills
              filter={selectedRule.filter}
              display="search-bar"
            />
            {selectedRule.assignments.length > 0 ? (
              <p className="text-muted-foreground text-sm">
                Already attached to:{" "}
                {selectedRule.assignments
                  .map(({ evaluator }) => evaluator.name)
                  .join(", ")}
              </p>
            ) : null}
          </>
        ) : selectedRuleId === null ? (
          <p className="text-muted-foreground text-sm">
            Continue to the rule editor to create a rule for this evaluator.
          </p>
        ) : null}
      </div>
    ),
  };

  const hasConfiguredScope = mode === "test-filters" || Boolean(selectedRule);
  const backfillContent = (
    <EvaluatorBackfillSettings
      enabled={backfill.enabled}
      canEnable={hasConfiguredScope}
      selectedWindow={backfill.window}
      range={backfill.range}
      maxItems={backfill.effectiveMaxItems}
      maxAllowedItems={backfill.allowedItems}
      matchingObservations={backfill.matchingObservations}
      isEstimating={backfill.isEstimating}
      onEnabledChange={(enabled) =>
        backfill.setEnabled(enabled, currentBackfillScope)
      }
      onWindowChange={(window) =>
        backfill.updateWindow(window, currentBackfillScope)
      }
      onRangeChange={(range) =>
        backfill.updateRange(range, currentBackfillScope)
      }
      onMaxItemsChange={backfill.setMaxItems}
    />
  );
  const costSummary = hasConfiguredScope ? (
    <EvaluatorSavedCostSummary
      estimates={activation.estimate.estimates}
      unavailableEstimateCount={activation.estimate.unavailableEstimateCount}
      matchingObservations={activation.estimate.matchingObservations}
      sampling={
        activation.estimate.sampling ??
        selectedRule?.sampling ??
        testFilterSampling
      }
      isEstimating={isEstimating}
      evaluatorType={evaluator.type}
      backfill={
        backfill.enabled
          ? {
              enabled: true,
              matchingObservations: backfill.matchingObservations,
              maxItems: backfill.effectiveMaxItems,
              isEstimating: backfill.isEstimating,
            }
          : { enabled: false }
      }
      onSamplingChange={
        mode === "test-filters"
          ? (sampling) => {
              setTestFilterSampling(sampling);
              setActivationSampling(sampling);
            }
          : null
      }
    />
  ) : evaluator.type !== EvalTemplateType.CODE ? (
    <div className="space-y-2">
      <h3 className="text-sm font-bold">Cost estimate</h3>
      <p className="text-muted-foreground text-sm">
        Costs will be estimated in the rule editor.
      </p>
    </div>
  ) : null;

  return dialogPhase === "saved" || dialogPhase === "closing-saved" ? (
    <EvaluatorSavedDialog
      open={dialogPhase === "saved"}
      mode={mode}
      modeContentByMode={modeContentByMode}
      backfillContent={backfillContent}
      costSummary={costSummary}
      canSubmit={
        !isEstimating &&
        !isCompleting &&
        (!backfill.enabled || !backfill.isEstimating) &&
        (!backfill.enabled || historicEvaluationLimit.isSuccess) &&
        (mode === "test-filters" || selectedRuleId !== undefined)
      }
      isSubmitting={
        attach.isPending ||
        createOrAttachFromEvaluatorFilters.isPending ||
        backfill.isScheduling ||
        isCompleting
      }
      primaryActionLabel={
        mode === "test-filters"
          ? "Execute"
          : selectedRule
            ? "Execute"
            : "Open rule editor"
      }
      onModeChange={handleModeChange}
      onOpenAutoFocus={requestInitialEstimate}
      onDismiss={() => {
        createRuleHandoffPending.current = false;
        setDialogPhase("closed");
        onDismiss().catch(trpcErrorToast);
      }}
      onSecondaryAction={() => {
        setDialogPhase("closed");
        finish().catch(trpcErrorToast);
      }}
      onPrimaryAction={handlePrimaryAction}
      onCloseAnimationEnd={completeCreateRuleHandoff}
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
      initialEvaluator={{ ...evaluator, initialVariableMapping: null }}
      successNotification="none"
    />
  ) : null;
}
