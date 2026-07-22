import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  setupProps: vi.fn(),
}));

vi.mock("@/src/features/evals/v2/components/EvaluatorSetupForm", () => ({
  EvaluatorSetupForm: (props: Record<string, unknown>) => {
    mocks.setupProps(props);
    return <div>Evaluator setup</div>;
  },
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    evalsV2: {
      rules: {
        useQuery: () => ({
          isPending: false,
          data: [
            {
              id: "attached-rule",
              targetObject: "event",
              filter: [{ column: "environment", value: ["production"] }],
              sampling: 0.5,
            },
          ],
        }),
      },
    },
  },
}));

import { EvaluatorEditView } from "./EvaluatorEditView";

describe("EvaluatorEditView", () => {
  it("passes attached rules to filter suggestions without rendering relationship controls", () => {
    render(
      <EvaluatorEditView
        projectId="project-1"
        evaluatorId="evaluator-1"
        sourceTemplate={{ type: "LLM_AS_JUDGE" } as never}
        initialMapping={[]}
        scoreName="Quality"
        description=""
        attachedRuleIds={["attached-rule"]}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Evaluator setup")).toBeInTheDocument();
    expect(mocks.setupProps).toHaveBeenCalledWith(
      expect.objectContaining({
        attachedRuleIds: ["attached-rule"],
        initialFilterState: [],
        initialSampling: 1,
      }),
    );
    expect(mocks.setupProps.mock.lastCall?.[0]).not.toHaveProperty(
      "renderRuleControls",
    );
    expect(mocks.setupProps.mock.lastCall?.[0]).not.toHaveProperty(
      "renderFilterActions",
    );
  });

  it("keeps rule recovery links by prefilling the linked rule", () => {
    render(
      <EvaluatorEditView
        projectId="project-1"
        evaluatorId="evaluator-1"
        sourceTemplate={{ type: "LLM_AS_JUDGE" } as never}
        initialMapping={[]}
        scoreName="Quality"
        description=""
        attachedRuleIds={["attached-rule"]}
        initialEvaluationRuleId="attached-rule"
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(mocks.setupProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        initialFilterState: [{ column: "environment", value: ["production"] }],
        initialSampling: 0.5,
      }),
    );
  });
});
