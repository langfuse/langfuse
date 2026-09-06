import { Button } from "@/src/components/ui/button";
import { RuleFilterPills } from "@/src/features/evals/v2/components/Rules/RuleFilterPills/RuleFilterPills";
import { classifySampleFiltersForRule } from "@/src/features/evals/v2/fns/rules/classifySampleFiltersForRule";
import preview from "../../../../../../../.storybook/preview";
import { fn } from "storybook/test";
import { EvaluatorSavedCostSummary } from "./EvaluatorSavedCostSummary";
import { EvaluatorSavedDialog } from "./EvaluatorSavedDialog";
import { EvaluatorSavedRuleFilterPreview } from "./EvaluatorSavedRuleFilterPreview";

const meta = preview.meta({ component: EvaluatorSavedDialog });

const modeContentByMode = {
  "test-filters": (
    <RuleFilterPills
      display="search-bar"
      filter={[
        {
          column: "environment",
          type: "string",
          operator: "does not contain",
          value: "langfuse-",
        },
        {
          column: "environment",
          type: "stringOptions",
          operator: "none of",
          value: ["sdk-experiment"],
        },
        {
          column: "experimentId",
          type: "null",
          operator: "is null",
          value: "",
        },
        {
          column: "name",
          type: "string",
          operator: "contains",
          value: "checkout",
        },
      ]}
    />
  ),
  "different-scope": (
    <div className="space-y-3">
      <Button variant="outline" className="w-full justify-start font-normal">
        Production generations
      </Button>
      <RuleFilterPills
        display="search-bar"
        filter={[
          {
            column: "environment",
            type: "stringOptions",
            operator: "any of",
            value: ["production"],
          },
          {
            column: "type",
            type: "stringOptions",
            operator: "any of",
            value: ["GENERATION"],
          },
        ]}
      />
    </div>
  ),
};

const newRuleModeContent = {
  ...modeContentByMode,
  "different-scope": (
    <div className="space-y-3">
      <Button variant="outline" className="w-full justify-start font-normal">
        New rule
      </Button>
      <p className="text-muted-foreground text-sm">
        Continue to the rule editor to create a rule for this evaluator.
      </p>
    </div>
  ),
};

const filtersWithUnsupportedConditions = [
  {
    column: "type",
    type: "stringOptions" as const,
    operator: "any of" as const,
    value: ["GENERATION"],
  },
  {
    column: "totalCost",
    type: "number" as const,
    operator: ">" as const,
    value: 0.01,
  },
  {
    column: "scores_avg",
    type: "numberObject" as const,
    key: "accuracy",
    operator: ">" as const,
    value: 0.8,
  },
];

const { unsupportedReasons } = classifySampleFiltersForRule(
  filtersWithUnsupportedConditions,
);

const unsupportedFilterModeContent = {
  ...modeContentByMode,
  "test-filters": (
    <EvaluatorSavedRuleFilterPreview
      filter={filtersWithUnsupportedConditions}
      unsupportedReasons={unsupportedReasons}
    />
  ),
};

const sharedArgs = {
  open: true,
  modeContentByMode,
  canSubmit: true,
  isSubmitting: false,
  onModeChange: fn(),
  onDismiss: fn(),
  onSecondaryAction: fn(),
  onPrimaryAction: fn(),
};

export const FromTestFilters = meta.story({
  args: {
    ...sharedArgs,
    mode: "test-filters",
    costSummary: (
      <EvaluatorSavedCostSummary
        estimates={[
          {
            evaluatorId: "evaluator-1",
            evaluatorName: "Conciseness",
            matchingObservations: 1_840,
            sampling: 0.4,
            testRunCostUsd: 0.001,
            estimatedCostUsd: 0.736,
          },
        ]}
        unavailableEstimateCount={0}
        matchingObservations={1_840}
        sampling={0.4}
        isEstimating={false}
        evaluatorType="LLM_AS_JUDGE"
        onSamplingChange={fn()}
      />
    ),
    primaryActionLabel: "Execute",
  },
});

export const UnsupportedFilters = meta.story({
  args: {
    ...sharedArgs,
    mode: "test-filters",
    modeContentByMode: unsupportedFilterModeContent,
    costSummary: (
      <EvaluatorSavedCostSummary
        estimates={[
          {
            evaluatorId: "evaluator-1",
            evaluatorName: "Conciseness",
            matchingObservations: 624,
            sampling: 0.4,
            testRunCostUsd: 0.001,
            estimatedCostUsd: 0.2496,
          },
        ]}
        unavailableEstimateCount={0}
        matchingObservations={624}
        sampling={0.4}
        isEstimating={false}
        evaluatorType="LLM_AS_JUDGE"
        onSamplingChange={fn()}
      />
    ),
    primaryActionLabel: "Execute",
  },
});

export const ExistingRule = meta.story({
  args: {
    ...sharedArgs,
    mode: "different-scope",
    costSummary: (
      <EvaluatorSavedCostSummary
        estimates={[
          {
            evaluatorId: "evaluator-1",
            evaluatorName: "Conciseness",
            matchingObservations: 318,
            sampling: 0.25,
            testRunCostUsd: 0.001,
            estimatedCostUsd: 0.0795,
          },
        ]}
        unavailableEstimateCount={0}
        matchingObservations={318}
        sampling={0.25}
        isEstimating={false}
        evaluatorType="LLM_AS_JUDGE"
        onSamplingChange={null}
      />
    ),
    primaryActionLabel: "Execute",
  },
});

export const NewRule = meta.story({
  args: {
    ...sharedArgs,
    mode: "different-scope",
    modeContentByMode: newRuleModeContent,
    costSummary: (
      <div className="space-y-2">
        <h3 className="text-sm font-bold">Cost estimate</h3>
        <p className="text-muted-foreground text-sm">
          Costs will be estimated in the rule editor.
        </p>
      </div>
    ),
    primaryActionLabel: "Open rule editor",
  },
});
