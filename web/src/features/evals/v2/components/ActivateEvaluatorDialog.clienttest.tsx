import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  attach: vi.fn(),
  costEstimate: vi.fn(),
  warningToast: vi.fn(),
  issue: null as {
    outcome: "failed" | "unavailable";
    message: string;
    evaluatorId: string;
    ruleId: string;
    evaluatorName: string;
    evaluationRuleName: string;
    requiresMappingReview?: true;
  } | null,
  rules: [] as Array<{
    id: string;
    name: string;
    targetObject: string;
    filter: Array<Record<string, unknown>>;
    sampling: number;
  }>,
}));

vi.mock("sonner", () => ({
  toast: { warning: mocks.warningToast },
}));

vi.mock("@/src/features/evals/v2/hooks/useValidatedRuleAttachment", () => ({
  useValidatedRuleAttachment: () => ({
    attach: mocks.attach,
    dismissIssue: vi.fn(),
    pendingKey: null,
    issue: mocks.issue,
  }),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    evalsV2: {
      rules: {
        useQuery: () => ({
          data: mocks.rules,
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock("@/src/features/evals/v2/components/ActivationCostEstimate", () => ({
  ActivationCostEstimate: (props: { testRunCostUsd: number | null }) => {
    mocks.costEstimate(props);
    return (
      <div>
        Estimated daily cost
        <span data-testid="test-run-cost">{props.testRunCostUsd}</span>
      </div>
    );
  },
}));

import { ActivateEvaluatorDialog } from "./ActivateEvaluatorDialog";

const setupFilter = [
  {
    column: "environment",
    type: "stringOptions" as const,
    operator: "any of" as const,
    value: ["production"],
  },
];

function renderDialog(
  onOpenChange = vi.fn(),
  onComplete = vi.fn(),
  onCreateRule = vi.fn(),
  onReviewRule = vi.fn(),
) {
  render(
    <ActivateEvaluatorDialog
      projectId="project-1"
      evaluatorId="evaluator-1"
      evaluatorName="Quality"
      attachedRuleIds={[]}
      setupFilter={setupFilter}
      setupSampling={0.5}
      testRunCostUsd={0.002}
      isCodeEvaluator={false}
      open
      onOpenChange={onOpenChange}
      onComplete={onComplete}
      onCreateRule={onCreateRule}
      onReviewRule={onReviewRule}
    />,
  );
  return { onOpenChange, onComplete, onCreateRule, onReviewRule };
}

describe("ActivateEvaluatorDialog", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rules = [];
    mocks.issue = null;
    mocks.attach.mockResolvedValue({ attached: true });
  });

  it("keeps the saved evaluator disabled when Not now is chosen", () => {
    const { onOpenChange, onComplete } = renderDialog();

    expect(
      screen.getByText("Evaluator saved successfully"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your evaluator is ready. Run it automatically on incoming production observations by creating a rule or attaching it to an existing one.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Configured filters")).not.toBeInTheDocument();
    expect(screen.getByText("Estimated daily cost")).toBeInTheDocument();
    expect(screen.getByText("Choose a rule")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The evaluator will run on incoming observations matched by this rule.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Attach and run" }),
    ).toBeDisabled();
    expect(mocks.costEstimate).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: setupFilter,
        sampling: 0.5,
        testRunCostUsd: 0.002,
        enabled: true,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    expect(onComplete).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("continues to the prefilled rule dialog", () => {
    const { onOpenChange, onComplete, onCreateRule } = renderDialog();

    fireEvent.click(screen.getByRole("combobox", { name: "Choose a rule" }));
    fireEvent.click(screen.getByText("Create new rule"));
    fireEvent.click(screen.getByRole("button", { name: "Configure new rule" }));

    expect(onCreateRule).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("attaches to the only compatible existing rule and finishes after validation", async () => {
    mocks.rules = [
      {
        id: "rule-1",
        name: "Production",
        targetObject: "event",
        filter: setupFilter,
        sampling: 0.25,
      },
    ];
    const { onComplete, onCreateRule, onReviewRule } = renderDialog();

    fireEvent.click(screen.getByRole("combobox", { name: "Choose a rule" }));
    fireEvent.click(screen.getByText("Production"));
    fireEvent.click(screen.getByRole("button", { name: "Attach and run" }));

    await waitFor(() =>
      expect(mocks.attach).toHaveBeenCalledWith({
        evaluatorId: "evaluator-1",
        ruleId: "rule-1",
        evaluatorName: "Quality",
        evaluationRuleName: "Production",
      }),
    );
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onCreateRule).not.toHaveBeenCalled();
    expect(onReviewRule).not.toHaveBeenCalled();
    expect(mocks.costEstimate).toHaveBeenCalledWith(
      expect.objectContaining({ filter: setupFilter, sampling: 0.25 }),
    );
  });

  it("opens the rule mapping when automatic validation finds incomplete mappings", async () => {
    mocks.rules = [
      {
        id: "rule-1",
        name: "Production",
        targetObject: "event",
        filter: setupFilter,
        sampling: 1,
      },
    ];
    mocks.attach.mockResolvedValue({
      attached: true,
      issue: {
        outcome: "failed",
        message: "Please complete all prompt variable mappings.",
        requiresMappingReview: true,
      },
    });
    const { onComplete, onReviewRule } = renderDialog();

    fireEvent.click(screen.getByRole("combobox", { name: "Choose a rule" }));
    fireEvent.click(screen.getByText("Production"));
    fireEvent.click(screen.getByRole("button", { name: "Attach and run" }));

    await waitFor(() => expect(onReviewRule).toHaveBeenCalledWith("rule-1"));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("closes after a disposable validation failure without opening the rule editor", async () => {
    mocks.rules = [
      {
        id: "rule-1",
        name: "Production",
        targetObject: "event",
        filter: setupFilter,
        sampling: 1,
      },
    ];
    mocks.issue = {
      outcome: "unavailable",
      message: "The evaluator test could not be completed.",
      evaluatorId: "evaluator-1",
      ruleId: "rule-1",
      evaluatorName: "Quality",
      evaluationRuleName: "Production",
    };
    mocks.attach.mockResolvedValue({
      attached: true,
      issue: mocks.issue,
    });
    const { onComplete, onReviewRule } = renderDialog();

    fireEvent.click(screen.getByRole("combobox", { name: "Choose a rule" }));
    fireEvent.click(screen.getByText("Production"));
    fireEvent.click(screen.getByRole("button", { name: "Attach and run" }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(onReviewRule).not.toHaveBeenCalled();
    expect(mocks.warningToast).toHaveBeenCalledWith(
      "Evaluator attached, but validation needs attention",
      {
        description: "The evaluator test could not be completed.",
      },
    );
  });
});
