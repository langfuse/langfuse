import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EvalTargetObject, type FilterState } from "@langfuse/shared";

import { createRuleSetupStore } from "@/src/features/evals/v2/stores/createRuleSetupStore";
import { RuleFilterStep } from "./RuleFilterStep";

const mocks = vi.hoisted(() => ({
  attachedRules: [] as Array<{
    evaluationRule: {
      id: string;
      name: string;
      targetObject: string;
      filter: FilterState;
    };
  }>,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    evalsV2: {
      rules: {
        listRulesForEvaluator: {
          useQuery: () => ({
            data: mocks.attachedRules,
            isPending: false,
          }),
        },
      },
    },
  },
}));

vi.mock(
  "@/src/features/evals/v2/components/Evaluators/Testing/components/RuleSampleObservationSelector/RuleSampleObservationSelector",
  () => ({
    RuleSampleObservationSelector: ({
      filterState,
      tableName,
    }: {
      filterState: FilterState;
      tableName: string;
    }) => <div data-testid={tableName}>{JSON.stringify(filterState)}</div>,
  }),
);

vi.mock(
  "@/src/features/evals/v2/components/Rules/RuleSetup/components/RuleEvaluatorResultTriggerSection",
  () => ({ RuleEvaluatorResultTriggerSection: () => null }),
);

vi.mock(
  "@/src/features/evals/v2/components/Rules/RuleSetup/components/RuleTriggerTypeSelector",
  () => ({ RuleTriggerTypeSelector: () => null }),
);

vi.mock("@/src/features/evals/v2/components/Stepper/Stepper", () => ({
  Stepper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/src/components/design-system/SelectInput/SelectInput", () => ({
  SelectInput: ({
    id,
    value,
    options,
    onValueChange,
  }: {
    id: string;
    value: string;
    options: Array<{ value: string; label: string }>;
    onValueChange: (value: string) => void;
  }) => (
    <select
      id={id}
      aria-label="Preview observation source"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

const firstFilter = [
  {
    column: "name",
    type: "string",
    operator: "contains",
    value: "first",
  },
] as FilterState;
const secondFilter = [
  {
    column: "name",
    type: "string",
    operator: "contains",
    value: "second",
  },
] as FilterState;

function createStore() {
  return createRuleSetupStore({
    name: "",
    filter: [],
    sampling: 1,
    assignments: [],
    targetObject: EvalTargetObject.SCORE_RESULT,
    scoreResultTrigger: {
      evaluatorId: "evaluator-1",
      predicates: [
        {
          scoreName: "quality",
          dataType: "NUMERIC",
          operator: ">",
          value: 0.5,
        },
      ],
    },
  });
}

function attachedRule(id: string, name: string, filter: FilterState) {
  return {
    evaluationRule: {
      id,
      name,
      targetObject: EvalTargetObject.EVENT,
      filter,
    },
  };
}

describe("RuleFilterStep evaluator result preview", () => {
  it("shows all recent observations when the evaluator has no attached rule", () => {
    mocks.attachedRules = [];

    render(<RuleFilterStep projectId="project-1" store={createStore()} />);

    expect(
      screen.getByTestId("evaluation-result-rule-preview"),
    ).toHaveTextContent("[]");
    expect(
      screen.queryByLabelText("Preview observation source"),
    ).not.toBeInTheDocument();
  });

  it("uses the only attached rule filter without showing a selector", () => {
    mocks.attachedRules = [attachedRule("rule-1", "First rule", firstFilter)];

    render(<RuleFilterStep projectId="project-1" store={createStore()} />);

    expect(
      screen.getByTestId("evaluation-result-rule-preview"),
    ).toHaveTextContent(JSON.stringify(firstFilter));
    expect(
      screen.queryByLabelText("Preview observation source"),
    ).not.toBeInTheDocument();
  });

  it("selects which attached rule supplies the preview filter", () => {
    mocks.attachedRules = [
      attachedRule("rule-1", "First rule", firstFilter),
      attachedRule("rule-2", "Second rule", secondFilter),
    ];

    render(<RuleFilterStep projectId="project-1" store={createStore()} />);

    expect(
      screen.getByTestId("evaluation-result-rule-preview"),
    ).toHaveTextContent(JSON.stringify(firstFilter));

    fireEvent.change(screen.getByLabelText("Preview observation source"), {
      target: { value: "rule-2" },
    });

    expect(
      screen.getByTestId("evaluation-result-rule-preview"),
    ).toHaveTextContent(JSON.stringify(secondFilter));
  });
});
