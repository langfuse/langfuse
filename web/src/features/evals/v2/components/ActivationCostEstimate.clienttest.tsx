import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/src/components/ui/tooltip";

const mocks = vi.hoisted(() => ({
  matchingObservationCount: 10,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    events: {
      countAll: {
        useQuery: () => ({
          data: { totalCount: mocks.matchingObservationCount },
          isLoading: false,
        }),
      },
    },
    evals: {
      avgCostByEvaluatorIds: {
        useQuery: () => ({ data: {}, isLoading: false }),
      },
    },
  },
}));

import { ActivationCostEstimate } from "./ActivationCostEstimate";

describe("ActivationCostEstimate", () => {
  beforeEach(() => {
    mocks.matchingObservationCount = 10;
  });

  it("does not show without a usable cost estimate", () => {
    const { container } = render(
      <ActivationCostEstimate
        projectId="project-1"
        evaluatorId="evaluator-1"
        filter={[]}
        sampling={1}
        testRunCostUsd={null}
        isCodeEvaluator={false}
        enabled
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows an estimate when matching observations and test cost exist", () => {
    render(
      <ActivationCostEstimate
        projectId="project-1"
        evaluatorId="evaluator-1"
        filter={[]}
        sampling={1}
        testRunCostUsd={0.002}
        isCodeEvaluator={false}
        enabled
      />,
      { wrapper: TooltipProvider },
    );

    expect(screen.getByText("Estimated daily cost")).toBeInTheDocument();
  });

  it("does not show a cost estimate for code evaluators", () => {
    const { container } = render(
      <ActivationCostEstimate
        projectId="project-1"
        evaluatorId="evaluator-1"
        filter={[]}
        sampling={1}
        testRunCostUsd={null}
        isCodeEvaluator
        enabled
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("does not show a cost estimate without matching observations", () => {
    mocks.matchingObservationCount = 0;

    const { container } = render(
      <ActivationCostEstimate
        projectId="project-1"
        evaluatorId="evaluator-1"
        filter={[]}
        sampling={1}
        testRunCostUsd={0.002}
        isCodeEvaluator={false}
        enabled
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
