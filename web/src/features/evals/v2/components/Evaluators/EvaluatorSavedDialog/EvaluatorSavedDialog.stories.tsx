import { Button } from "@/src/components/ui/button";
import { RuleFilterPills } from "@/src/features/evals/v2/components/Rules/RuleFilterPills/RuleFilterPills";
import preview from "../../../../../../../.storybook/preview";
import { fn } from "storybook/test";
import { EvaluatorSavedCostSummary } from "./EvaluatorSavedCostSummary";
import { EvaluatorSavedDialog } from "./EvaluatorSavedDialog";

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

const sharedArgs = {
  open: true,
  modeContentByMode,
  canSubmit: true,
  isSubmitting: false,
  onModeChange: fn(),
  onOpenChange: fn(),
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
