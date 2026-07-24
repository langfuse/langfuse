import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/src/components/ui/tooltip";

const mocks = vi.hoisted(() => ({
  matchingObservationCount: 10,
  countQuery: vi.fn(),
  averageCosts: {} as Record<
    string,
    { avgCost: number; executionCount: number }
  >,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    events: {
      countAll: {
        useQuery: (input: unknown) => {
          mocks.countQuery(input);
          return {
            data: { totalCount: mocks.matchingObservationCount },
            isLoading: false,
          };
        },
      },
    },
    evals: {
      avgCostByEvaluatorIds: {
        useQuery: () => ({ data: mocks.averageCosts, isLoading: false }),
      },
    },
  },
}));

vi.mock("@/src/components/ui/slider", () => ({
  Slider: ({
    value,
    onValueChange,
  }: {
    value: number[];
    onValueChange: (value: number[]) => void;
  }) => (
    <input
      aria-label="Slider value"
      value={(value[0] ?? 0) * 100}
      onChange={(event) =>
        onValueChange([Number(event.currentTarget.value) / 100])
      }
    />
  ),
}));

import { ActivationCostEstimate } from "./ActivationCostEstimate";

describe("ActivationCostEstimate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T12:00:00.000Z"));
    vi.clearAllMocks();
    mocks.matchingObservationCount = 10;
    mocks.averageCosts = {};
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows matching usage even without a usable cost estimate", () => {
    render(
      <ActivationCostEstimate
        projectId="project-1"
        filter={[]}
        sampling={1}
        testRunCostUsd={null}
        isCodeEvaluator={false}
        enabled
      />,
    );

    expect(
      screen.getByText("10 matching observations in the last 7 days"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/≈/)).not.toBeInTheDocument();
    expect(screen.getByText("Cost unavailable")).toBeInTheDocument();
  });

  it("uses the evaluator's historical average when no test cost is available", () => {
    mocks.averageCosts = {
      "evaluator-1": { avgCost: 0.002, executionCount: 20 },
    };

    render(
      <ActivationCostEstimate
        projectId="project-1"
        evaluatorId="evaluator-1"
        filter={[]}
        sampling={0.5}
        testRunCostUsd={null}
        isCodeEvaluator={false}
        enabled
      />,
      { wrapper: TooltipProvider },
    );

    expect(screen.getByText("≈ $0.01 / 7 days")).toBeInTheDocument();
    expect(screen.queryByText("Cost unavailable")).not.toBeInTheDocument();
  });

  it("combines the seven-day match count and cost and reveals the filter", () => {
    render(
      <ActivationCostEstimate
        projectId="project-1"
        filter={[
          {
            column: "environment",
            type: "stringOptions",
            operator: "any of",
            value: ["production"],
          },
        ]}
        sampling={0.5}
        testRunCostUsd={0.002}
        isCodeEvaluator={false}
        enabled
      />,
      { wrapper: TooltipProvider },
    );

    expect(screen.getByText("Estimated usage & cost")).toBeInTheDocument();
    expect(
      screen.getByText("10 matching observations in the last 7 days"),
    ).toBeInTheDocument();
    expect(screen.getByText("≈ $0.01 / 7 days")).toBeInTheDocument();
    expect(screen.queryByText("environment")).not.toBeInTheDocument();
    expect(mocks.countQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: [
          expect.objectContaining({ column: "environment" }),
          {
            column: "startTime",
            type: "datetime",
            operator: ">=",
            value: new Date("2026-07-16T12:00:00.000Z"),
          },
        ],
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Estimated usage & cost/i }),
    );

    expect(screen.getByText("Filter")).toBeInTheDocument();
    expect(screen.getByText("environment")).toBeInTheDocument();
    expect(
      screen.getByLabelText("How this estimate is calculated"),
    ).toBeInTheDocument();
  });

  it("shows matching usage without a cost for code evaluators", () => {
    render(
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

    expect(
      screen.getByText("10 matching observations in the last 7 days"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/≈/)).not.toBeInTheDocument();
  });

  it("shows when no observations matched", () => {
    mocks.matchingObservationCount = 0;

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

    expect(
      screen.getByText("0 matching observations in the last 7 days"),
    ).toBeInTheDocument();
    expect(screen.getByText("≈ $0.00 / 7 days")).toBeInTheDocument();
  });

  it("allows sampling to be changed from the expanded cost breakdown", () => {
    const onSamplingChange = vi.fn();

    render(
      <ActivationCostEstimate
        projectId="project-1"
        filter={[]}
        sampling={0.5}
        testRunCostUsd={0.002}
        isCodeEvaluator={false}
        enabled
        onSamplingChange={onSamplingChange}
      />,
      { wrapper: TooltipProvider },
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Estimated usage & cost/i }),
    );
    expect(screen.queryByLabelText("Slider value")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sampling 50%" }));
    fireEvent.change(screen.getByLabelText("Slider value"), {
      target: { value: "25" },
    });

    expect(onSamplingChange).toHaveBeenCalledWith(0.25);
  });
});
