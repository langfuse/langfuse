import {
  TopicsTargetObject,
  type FilterState,
  type ObservationVariableMapping,
} from "@langfuse/shared";
import { useId, useState } from "react";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Slider } from "@/src/components/ui/Slider";
import { EvaluatorSavedRuleFilterPreview } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSavedDialog/EvaluatorSavedRuleFilterPreview";
import { RuleFilterPills } from "@/src/features/evals/v2/components/Rules/RuleFilterPills/RuleFilterPills";
import {
  SAMPLING_SLIDER_MIN,
  SAMPLING_SLIDER_STEP,
} from "@/src/features/evals/v2/constants/ruleSampling";
import { classifySampleFiltersForRule } from "@/src/features/evals/v2/fns/rules/classifySampleFiltersForRule";
import { getFilterAnalyticsProperties } from "@/src/features/evals/v2/fns/getFilterAnalyticsProperties";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api, type RouterOutputs } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

type TraceRule = RouterOutputs["evalsV2"]["rules"]["list"]["rules"][number];

const NEW_RULE = "new-rule";

function samplingPercent(sampling: number) {
  return `${Number((sampling * 100).toFixed(2))}%`;
}

function existingRuleCopy(rule: TraceRule, alreadyAttached: boolean) {
  if (alreadyAttached) {
    return {
      action: "Update trace rule",
      note: " The evaluator already runs on this rule; its variable mapping is updated.",
    };
  }
  return {
    action: "Add to trace rule",
    note: rule.enabled
      ? ""
      : " The rule is switched off and is switched on when you add the evaluator.",
  };
}

/**
 * After a trace-scope save: run the evaluator on a new trace rule built from
 * the panel's filters, or add it to a trace rule the project already has.
 */
export function TraceRuleSavedDialog({
  projectId,
  evaluator,
  filter,
  variableMapping,
  onDismiss,
  onFinish,
}: {
  projectId: string;
  evaluator: { id: string; name: string };
  filter: FilterState;
  variableMapping: ObservationVariableMapping[];
  onDismiss: () => Promise<void>;
  onFinish: () => Promise<void>;
}) {
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const ruleSelectId = useId();
  const samplingLabelId = useId();
  const [ruleChoice, setRuleChoice] = useState<string>(NEW_RULE);
  const [sampling, setSampling] = useState(1);
  const traceRules = api.evalsV2.rules.list.useQuery({
    projectId,
    page: 1,
    limit: 100,
    targetObjects: [TopicsTargetObject],
  });
  const createRule = api.evalsV2.rules.createTraceTranscript.useMutation({
    onError: (error) => trpcErrorToast(error, "evaluator_rule.create"),
  });
  const attach = api.evalsV2.rules.attach.useMutation({
    onError: (error) => trpcErrorToast(error, "evaluator_rule.attach"),
  });
  const updateRule = api.evalsV2.rules.update.useMutation({
    onError: (error) => trpcErrorToast(error, "evaluator_rule.update"),
  });

  const existingRules = traceRules.data?.rules ?? [];
  const selectedRule = existingRules.find((rule) => rule.id === ruleChoice);
  const alreadyAttached =
    selectedRule?.assignments.some(
      (assignment) => assignment.evaluator.id === evaluator.id,
    ) ?? false;
  const { supportedFilters, unsupportedReasons } = classifySampleFiltersForRule(
    filter,
    TopicsTargetObject,
  );
  const pending =
    createRule.isPending || attach.isPending || updateRule.isPending;
  const selectedRuleCopy = selectedRule
    ? existingRuleCopy(selectedRule, alreadyAttached)
    : null;

  const finish = async (title: string, ruleName: string) => {
    showSuccessToast({
      operation: "evaluation_rule.create",
      title,
      description: `${ruleName} evaluates new matching traces.`,
    });
    await utils.evalsV2.invalidate();
    await onFinish();
  };

  const createNewRule = async () => {
    const rule = await createRule.mutateAsync({
      projectId,
      name: `${evaluator.name} on traces`,
      targetObject: TopicsTargetObject,
      filter: supportedFilters,
      sampling,
      enabled: true,
      evaluatorAssignments: [{ evaluatorId: evaluator.id, variableMapping }],
    });
    capture("evaluation_rules:create", {
      assignmentCount: 1,
      ...getFilterAnalyticsProperties(supportedFilters),
      samplingPercent: Math.round(sampling * 100),
      isEnabled: true,
      source: "evaluator_create_trace",
    });
    await finish("Trace rule created", rule.name);
  };

  const addToRule = async (rule: TraceRule) => {
    if (alreadyAttached) {
      // The rule keeps its other evaluators; only this one's mapping changes.
      await updateRule.mutateAsync({
        projectId,
        ruleId: rule.id,
        evaluatorMappings: rule.assignments.map((assignment) => ({
          evaluatorId: assignment.evaluator.id,
          variableMapping:
            assignment.evaluator.id === evaluator.id
              ? variableMapping
              : assignment.variableMapping,
        })),
      });
    } else {
      await attach.mutateAsync({
        projectId,
        ruleId: rule.id,
        evaluatorId: evaluator.id,
        variableMapping,
        enableRule: !rule.enabled,
      });
      capture("evaluation_rules:attach_evaluator", {
        evaluatorCount: 1,
        source: "evaluator_create_trace",
      });
    }
    await finish(
      alreadyAttached ? "Trace rule updated" : "Evaluator added to trace rule",
      rule.name,
    );
  };

  return (
    <DialogController
      initialState={() => true}
      onDismiss={() => {
        onDismiss().catch(() => undefined);
      }}
      renderDialog={() => (
        <Dialog
          title="Evaluator saved"
          closeLabel="Skip"
          requireExplicitClose={pending}
          actions={[
            {
              label: selectedRuleCopy?.action ?? "Create trace rule",
              loading: pending,
              onClick: () => {
                (selectedRule
                  ? addToRule(selectedRule)
                  : createNewRule()
                ).catch(() => undefined);
              },
            },
          ]}
        >
          <Dialog.Body>
            <div className="flex flex-col gap-4 text-sm">
              <p>
                Run it on new traces. Each variable reads the trace transcript
                the way you mapped it.
              </p>
              <div className="flex flex-col gap-1.5">
                <label className="font-bold" htmlFor={ruleSelectId}>
                  Trace rule
                </label>
                <SelectInput
                  id={ruleSelectId}
                  value={selectedRule ? selectedRule.id : NEW_RULE}
                  onValueChange={setRuleChoice}
                  placeholder="Select a trace rule"
                  disabled={pending}
                  options={[
                    { value: NEW_RULE, label: "New trace rule" },
                    ...existingRules.map((rule) => ({
                      value: rule.id,
                      label: rule.name,
                      badges: rule.enabled
                        ? []
                        : [{ text: "Inactive", color: "filled" as const }],
                    })),
                  ]}
                />
              </div>
              {selectedRule ? (
                <div className="flex flex-col gap-2">
                  {selectedRule.filter.length > 0 ? (
                    <RuleFilterPills
                      filter={selectedRule.filter}
                      display="search-bar"
                    />
                  ) : (
                    <p className="text-muted-foreground">All traces</p>
                  )}
                  <p className="text-muted-foreground">
                    This rule evaluates {samplingPercent(selectedRule.sampling)}{" "}
                    of matching traces. Its filters and sampling rate stay as
                    they are.
                    {selectedRuleCopy?.note}
                  </p>
                </div>
              ) : (
                <>
                  {filter.length > 0 ? (
                    <EvaluatorSavedRuleFilterPreview
                      filter={filter}
                      unsupportedReasons={unsupportedReasons}
                    />
                  ) : (
                    <p className="text-muted-foreground">All traces</p>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <span className="font-bold" id={samplingLabelId}>
                      Sampling rate
                    </span>
                    <p className="text-muted-foreground">
                      The percentage of matching traces this rule evaluates.
                    </p>
                    <Slider
                      aria-labelledby={samplingLabelId}
                      min={SAMPLING_SLIDER_MIN}
                      max={1}
                      step={SAMPLING_SLIDER_STEP}
                      value={[sampling]}
                      showInput
                      displayAsPercentage
                      disabled={pending}
                      onValueChange={(value) =>
                        setSampling(value[0] ?? sampling)
                      }
                    />
                  </div>
                </>
              )}
            </div>
          </Dialog.Body>
        </Dialog>
      )}
    >
      {() => null}
    </DialogController>
  );
}
