/* eslint-disable @repo/no-null-render */
import {
  BatchEvalSourceTable,
  EvalTemplateType,
  EvalTargetObject,
  type FilterState,
  type ObservationVariableMapping,
} from "@langfuse/shared";
import { ChevronDown } from "lucide-react";
import { subDays, subHours, subMonths } from "date-fns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  DEFAULT_EVALUATOR_BACKFILL_ITEMS,
  EvaluatorBackfillSettings,
  MAX_EVALUATOR_BACKFILL_ITEMS,
  type EvaluatorBackfillRange,
  type EvaluatorBackfillWindow,
} from "@/src/features/evals/v2/components/Evaluators/EvaluatorSavedDialog/EvaluatorBackfillSettings";

type Rule = RouterOutputs["evalsV2"]["rules"]["list"]["rules"][number];
type DialogPhase = "saved" | "closing-saved" | "create-rule" | "closed";

function getBackfillRange(
  window: Exclude<EvaluatorBackfillWindow, "custom">,
  now = new Date(),
): EvaluatorBackfillRange {
  switch (window) {
    case "24-hours":
      return { from: subHours(now, 24), to: now };
    case "7-days":
      return { from: subDays(now, 7), to: now };
    case "30-days":
      return { from: subDays(now, 30), to: now };
    case "90-days":
      return { from: subDays(now, 90), to: now };
  }
}

export function EvaluatorSavedDialogContainer({
  projectId,
  evaluator,
  onDismiss,
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
  const [backfillEnabled, setBackfillEnabled] = useState(false);
  const [backfillWindow, setBackfillWindow] =
    useState<EvaluatorBackfillWindow>("7-days");
  const [backfillRange, setBackfillRange] = useState<EvaluatorBackfillRange>(
    () => getBackfillRange("7-days"),
  );
  const [backfillMaxItems, setBackfillMaxItems] = useState(
    DEFAULT_EVALUATOR_BACKFILL_ITEMS,
  );
  const [backfillMatchingObservations, setBackfillMatchingObservations] =
    useState(0);
  const [isEstimatingBackfill, setIsEstimatingBackfill] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const estimateRequestId = useRef(0);
  const backfillEstimateRequestId = useRef(0);
  const hasScheduledBackfill = useRef(false);
  const backfillIdempotencyKey = useRef(crypto.randomUUID());
  // Strict Mode replays mount effects; this mutation must run once per dialog.
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
  const runEvaluation =
    api.batchAction.runEvaluation.createBackfill.useMutation({
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

  const requestBackfillEstimate = useCallback(
    async ({
      filter,
      sampling,
      range,
    }: {
      filter: FilterState;
      sampling: number;
      range: EvaluatorBackfillRange;
    }) => {
      const requestId = ++backfillEstimateRequestId.current;
      setIsEstimatingBackfill(true);
      try {
        const result =
          await utils.client.evalsV2.activationCostEstimates.mutate({
            projectId,
            evaluatorIds: [evaluator.id],
            filter,
            sampling,
            shouldRunMissingTest: false,
            timeRange: range,
          });
        if (backfillEstimateRequestId.current !== requestId) return;
        setBackfillMatchingObservations(
          Math.max(
            0,
            ...result.map(({ matchingObservations }) => matchingObservations),
          ),
        );
      } catch (error) {
        if (backfillEstimateRequestId.current === requestId) {
          trpcErrorToast(error);
        }
      } finally {
        if (backfillEstimateRequestId.current === requestId) {
          setIsEstimatingBackfill(false);
        }
      }
    },
    [evaluator.id, projectId, utils.client],
  );

  const scheduleBackfill = async ({
    filter,
    sampling,
    range,
  }: {
    filter: FilterState;
    sampling: number;
    range: EvaluatorBackfillRange;
  }) => {
    if (!backfillEnabled || hasScheduledBackfill.current) return;
    const effectiveRowLimit = Math.min(
      backfillMaxItems,
      historicEvaluationLimit.data ?? backfillMaxItems,
    );
    await runEvaluation.mutateAsync({
      projectId,
      evaluatorIds: [evaluator.id],
      evaluatorMappings: [
        {
          evaluatorId: evaluator.id,
          variableMapping: null,
        },
      ],
      evalVersion: "v2",
      sourceTable: BatchEvalSourceTable.EVENTS,
      idempotencyKey: backfillIdempotencyKey.current,
      sampling,
      rowLimit: effectiveRowLimit,
      backfillTimeRange: range,
      query: {
        filter,
        orderBy: { column: "startTime", order: "DESC" },
        useEventsTable: true,
      },
    });
    hasScheduledBackfill.current = true;
  };

  const attachToRule = async (
    rule: Rule,
    backfillExecutionRange: EvaluatorBackfillRange,
  ) => {
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
    await scheduleBackfill({
      filter: currentRule.filter,
      sampling: currentRule.sampling,
      range: backfillExecutionRange,
    });
    await invalidateRuleQueries();
    await finish();
  };

  const resolveFromTestFilters = async (
    backfillExecutionRange: EvaluatorBackfillRange,
  ) => {
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
    await scheduleBackfill({
      filter: supportedRuleFilters,
      sampling,
      range: backfillExecutionRange,
    });
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

  useEffect(() => {
    if (
      dialogPhase !== "saved" ||
      mode !== "test-filters" ||
      initialEstimateRequested.current
    ) {
      return;
    }
    initialEstimateRequested.current = true;
    requestEstimate({
      filter: supportedRuleFilters,
      sampling: testFilterSampling,
    }).catch(() => undefined);
  }, [
    dialogPhase,
    mode,
    requestEstimate,
    supportedRuleFilters,
    testFilterSampling,
  ]);

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
      if (backfillEnabled) {
        requestBackfillEstimate({
          filter: rule.filter,
          sampling: rule.sampling,
          range: backfillRange,
        }).catch(() => undefined);
      }
    },
    [
      backfillEnabled,
      backfillRange,
      requestBackfillEstimate,
      requestEstimate,
      setActivationSampling,
    ],
  );

  const selectNewRule = () => {
    estimateRequestId.current += 1;
    setActivationOpen(false);
    setSelectedRuleId(null);
    setIsEstimating(false);
  };

  useEffect(() => {
    if (
      mode !== "different-scope" ||
      selectedRuleId !== undefined ||
      rulesPending
    ) {
      return;
    }

    const mostUsedRule = availableRules[0];
    if (mostUsedRule) {
      selectExistingRule(mostUsedRule);
    } else {
      setSelectedRuleId(null);
    }
  }, [availableRules, mode, rulesPending, selectExistingRule, selectedRuleId]);

  const handleModeChange = (nextMode: EvaluatorSavedMode) => {
    estimateRequestId.current += 1;
    if (nextMode !== "test-filters") initialEstimateRequested.current = false;
    setMode(nextMode);
    const mostUsedRule = availableRules[0];
    if (nextMode === "different-scope" && mostUsedRule) {
      selectExistingRule(mostUsedRule);
      return;
    }
    setSelectedRuleId(
      nextMode === "different-scope" && !rulesPending ? null : undefined,
    );
    setIsEstimating(false);
    if (nextMode === "test-filters") {
      setActivationSampling(testFilterSampling);
      if (backfillEnabled) {
        requestBackfillEstimate({
          filter: supportedRuleFilters,
          sampling: testFilterSampling,
          range: backfillRange,
        }).catch(() => undefined);
      }
    }
  };

  const updateBackfillRange = (range: EvaluatorBackfillRange) => {
    const now = new Date();
    const earliestAllowedStart = subMonths(now, 6);
    const nextRange = {
      from:
        range.from < earliestAllowedStart ? earliestAllowedStart : range.from,
      to: range.to > now ? now : range.to,
    };
    setBackfillRange(nextRange);
    const filter =
      mode === "test-filters" ? supportedRuleFilters : selectedRule?.filter;
    if (filter) {
      requestBackfillEstimate({
        filter,
        sampling:
          mode === "test-filters"
            ? testFilterSampling
            : (selectedRule?.sampling ?? 1),
        range: nextRange,
      }).catch(() => undefined);
    }
  };

  const handleBackfillEnabledChange = (enabled: boolean) => {
    setBackfillEnabled(enabled);
    if (!enabled) {
      backfillEstimateRequestId.current += 1;
      setIsEstimatingBackfill(false);
      return;
    }
    const filter =
      mode === "test-filters" ? supportedRuleFilters : selectedRule?.filter;
    if (filter) {
      requestBackfillEstimate({
        filter,
        sampling:
          mode === "test-filters"
            ? testFilterSampling
            : (selectedRule?.sampling ?? 1),
        range: backfillRange,
      }).catch(() => undefined);
    }
  };

  const handleBackfillWindowChange = (window: EvaluatorBackfillWindow) => {
    setBackfillWindow(window);
    if (window !== "custom") {
      updateBackfillRange(getBackfillRange(window));
    }
  };

  const backfillAllowedItems = Math.min(
    historicEvaluationLimit.data ?? MAX_EVALUATOR_BACKFILL_ITEMS,
    MAX_EVALUATOR_BACKFILL_ITEMS,
  );
  const effectiveBackfillMaxItems = Math.min(
    backfillMaxItems,
    backfillAllowedItems,
  );

  const handlePrimaryAction = () => {
    const backfillExecutionRange =
      backfillWindow === "custom"
        ? backfillRange
        : getBackfillRange(backfillWindow);
    if (mode === "test-filters") {
      capture("evaluators:saved_dialog_submit", {
        action: "test_filters",
        hasBackfill: backfillEnabled,
        backfillWindow: backfillEnabled ? backfillWindow : undefined,
        backfillMaxItems: backfillEnabled
          ? effectiveBackfillMaxItems
          : undefined,
      });
      setIsCompleting(true);
      resolveFromTestFilters(backfillExecutionRange).catch(() =>
        setIsCompleting(false),
      );
      return;
    }
    if (selectedRule) {
      capture("evaluators:saved_dialog_submit", {
        action: "existing_rule",
        hasBackfill: backfillEnabled,
        backfillWindow: backfillEnabled ? backfillWindow : undefined,
        backfillMaxItems: backfillEnabled
          ? effectiveBackfillMaxItems
          : undefined,
      });
      setIsCompleting(true);
      attachToRule(selectedRule, backfillExecutionRange).catch(() =>
        setIsCompleting(false),
      );
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
      enabled={backfillEnabled}
      canEnable={hasConfiguredScope}
      selectedWindow={backfillWindow}
      range={backfillRange}
      maxItems={effectiveBackfillMaxItems}
      maxAllowedItems={backfillAllowedItems}
      matchingObservations={backfillMatchingObservations}
      isEstimating={isEstimatingBackfill}
      onEnabledChange={handleBackfillEnabledChange}
      onWindowChange={handleBackfillWindowChange}
      onRangeChange={updateBackfillRange}
      onMaxItemsChange={setBackfillMaxItems}
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
        backfillEnabled
          ? {
              enabled: true,
              matchingObservations: backfillMatchingObservations,
              maxItems: effectiveBackfillMaxItems,
              isEstimating: isEstimatingBackfill,
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
      backfillExpanded={backfillEnabled}
      costSummary={costSummary}
      canSubmit={
        !isEstimating &&
        !isCompleting &&
        (!backfillEnabled || !isEstimatingBackfill) &&
        (!backfillEnabled || historicEvaluationLimit.isSuccess) &&
        (mode === "test-filters" || selectedRuleId !== undefined)
      }
      isSubmitting={
        attach.isPending ||
        createOrAttachFromEvaluatorFilters.isPending ||
        runEvaluation.isPending ||
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
