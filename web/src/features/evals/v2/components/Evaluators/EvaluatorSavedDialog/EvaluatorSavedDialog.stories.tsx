import { Button } from "@/src/components/ui/button";
import { RuleFilterPills } from "@/src/features/evals/v2/components/Rules/RuleFilterPills/RuleFilterPills";
import { classifySampleFiltersForRule } from "@/src/features/evals/v2/fns/rules/classifySampleFiltersForRule";
import preview from "../../../../../../../.storybook/preview";
import { fn } from "storybook/test";
import { EvaluatorSavedCostSummary } from "./EvaluatorSavedCostSummary";
import { EvaluatorSavedDialog } from "./EvaluatorSavedDialog";
import { EvaluatorSavedRuleFilterPreview } from "./EvaluatorSavedRuleFilterPreview";
import { EvaluatorBackfillSettings } from "../EvaluatorBackfillSettings/EvaluatorBackfillSettings";

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
  backfillContent: (
    <EvaluatorBackfillSettings
      enabled={false}
      canEnable
      selectedWindow="7-days"
      range={{
        from: new Date("2026-08-28T00:00:00"),
        to: new Date("2026-09-04T23:59:59.999"),
      }}
      maxItems={5_000}
      maxAllowedItems={25_000}
      matchingObservations={4_400}
      isEstimating={false}
      onEnabledChange={fn()}
      onWindowChange={fn()}
      onRangeChange={fn()}
      onMaxItemsChange={fn()}
    />
  ),
  backfillExpanded: false,
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
        backfill={{ enabled: false }}
        onSamplingChange={fn()}
      />
    ),
    primaryActionLabel: "Execute",
  },
});

const backfillCostSummary = (
  <EvaluatorSavedCostSummary
    estimates={[
      {
        evaluatorId: "evaluator-1",
        evaluatorName: "Conciseness",
        matchingObservations: 4_400,
        sampling: 1,
        testRunCostUsd: 0.0017,
        estimatedCostUsd: 7.48,
      },
    ]}
    unavailableEstimateCount={0}
    matchingObservations={4_400}
    sampling={1}
    isEstimating={false}
    evaluatorType="LLM_AS_JUDGE"
    backfill={{
      enabled: true,
      matchingObservations: 4_400,
      maxItems: 5_000,
      isEstimating: false,
    }}
    onSamplingChange={fn()}
  />
);

export const WithBackfill = meta.story({
  args: {
    ...sharedArgs,
    mode: "test-filters",
    backfillContent: (
      <EvaluatorBackfillSettings
        enabled
        canEnable
        selectedWindow="7-days"
        range={{
          from: new Date("2026-08-28T00:00:00"),
          to: new Date("2026-09-04T23:59:59.999"),
        }}
        maxItems={5_000}
        maxAllowedItems={25_000}
        matchingObservations={4_400}
        isEstimating={false}
        onEnabledChange={fn()}
        onWindowChange={fn()}
        onRangeChange={fn()}
        onMaxItemsChange={fn()}
      />
    ),
    backfillExpanded: true,
    costSummary: backfillCostSummary,
    primaryActionLabel: "Execute",
  },
});

export const WithCustomBackfill = meta.story({
  args: {
    ...sharedArgs,
    mode: "test-filters",
    backfillContent: (
      <EvaluatorBackfillSettings
        enabled
        canEnable
        selectedWindow="custom"
        range={{
          from: new Date("2026-08-01T00:00:00"),
          to: new Date("2026-09-04T23:59:59.999"),
        }}
        maxItems={5_000}
        maxAllowedItems={25_000}
        matchingObservations={21_420}
        isEstimating={false}
        onEnabledChange={fn()}
        onWindowChange={fn()}
        onRangeChange={fn()}
        onMaxItemsChange={fn()}
      />
    ),
    backfillExpanded: true,
    costSummary: backfillCostSummary,
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
        backfill={{ enabled: false }}
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
        backfill={{ enabled: false }}
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
