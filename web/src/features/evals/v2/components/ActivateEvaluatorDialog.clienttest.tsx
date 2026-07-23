import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  activate: vi.fn(),
  costEstimate: vi.fn(),
  evalsInvalidate: vi.fn(),
  evalsV2Invalidate: vi.fn(),
  showSuccessToast: vi.fn(),
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

vi.mock("@/src/features/notifications/showSuccessToast", () => ({
  showSuccessToast: mocks.showSuccessToast,
}));
vi.mock("@/src/utils/trpcErrorToast", () => ({
  trpcErrorToast: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      evals: { invalidate: mocks.evalsInvalidate },
      evalsV2: { invalidate: mocks.evalsV2Invalidate },
    }),
    evalsV2: {
      activateEvaluator: {
        useMutation: ({ onSuccess }: { onSuccess: () => void }) => ({
          mutate: (input: unknown) => {
            mocks.activate(input);
            onSuccess();
          },
          isPending: false,
        }),
      },
    },
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

function renderDialog(onOpenChange = vi.fn(), onComplete = vi.fn()) {
  render(
    <ActivateEvaluatorDialog
      projectId="project-1"
      evaluatorId="evaluator-1"
      evaluatorName="quality"
      setupFilter={setupFilter}
      setupSampling={0.5}
      testRunCostUsd={0.002}
      isCodeEvaluator={false}
      open
      onOpenChange={onOpenChange}
      onComplete={onComplete}
    />,
  );
  return { onOpenChange, onComplete };
}

describe("ActivateEvaluatorDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.evalsInvalidate.mockResolvedValue(undefined);
    mocks.evalsV2Invalidate.mockResolvedValue(undefined);
  });

  it("keeps the saved evaluator disabled when Keep disabled is chosen", () => {
    const { onOpenChange, onComplete } = renderDialog();

    expect(
      screen.getByText("Start running this evaluator?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your evaluator is saved. Run it on new observations that match the filters from step 1, or leave it inactive and start it later.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Configured filters")).not.toBeInTheDocument();
    expect(screen.getByText("Estimated daily cost")).toBeInTheDocument();
    expect(mocks.costEstimate).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: setupFilter,
        sampling: 0.5,
        testRunCostUsd: 0.002,
        enabled: true,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Run later" }));

    expect(mocks.activate).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("enables the evaluator on its configured filters", async () => {
    const { onOpenChange, onComplete } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Run evaluator" }));

    expect(mocks.activate).toHaveBeenCalledWith({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      rule: { mode: "setup" },
    });
    await waitFor(() =>
      expect(mocks.showSuccessToast).toHaveBeenCalledWith({
        title: "Evaluator is live",
        description: "“quality” will evaluate new matching observations.",
      }),
    );
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
