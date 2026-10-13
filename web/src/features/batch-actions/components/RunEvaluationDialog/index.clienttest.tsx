import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { createStore } from "zustand/vanilla";
import { vi } from "vitest";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { RunEvaluationDialog } from "./index";

const { submit, submitted } = vi.hoisted(() => ({
  submit: vi.fn<() => Promise<{ id: string }>>(),
  submitted: vi.fn(),
}));
vi.mock("@/src/utils/api", () => ({
  sendAsPostOption: {},
  api: {
    v4Transition: {
      forceV3Experience: {
        useQuery: () => ({ data: true, isPending: false }),
      },
    },
    evalsV2: {
      options: {
        useQuery: () => ({
          data: [
            {
              id: "evaluator",
              name: "Accuracy",
              type: "LLM",
              blockedAt: null,
              latestVersion: { variableMapping: [], prompt: "Rate the answer" },
            },
          ],
        }),
      },
    },
    events: { batchIO: { useQuery: () => ({ data: undefined }) } },
    batchAction: {
      runEvaluation: {
        create: {
          useMutation: () => ({ mutateAsync: submit, isPending: false }),
        },
      },
    },
  },
}));
vi.mock("@/src/features/notifications", () => ({
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));
vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock("@/src/features/evals", () => ({
  buildSelectedSampleObject: () => null,
  createRuleSetupStore: () => createStore(() => ({ assignments: [] })),
}));
vi.mock("./EvaluatorMappingStep", () => ({
  EvaluatorMappingStep: () => <div />,
}));
vi.mock("./EvaluatorSelectionStep", () => ({
  EvaluatorSelectionStep: ({
    onToggleEvaluator,
  }: {
    onToggleEvaluator: (id: string) => void;
  }) => (
    <button onClick={() => onToggleEvaluator("evaluator")}>
      Select Accuracy
    </button>
  ),
}));
vi.mock("./ConfirmationStep", () => ({
  ConfirmationStep: () => <p>Confirm evaluation</p>,
}));

function SelectionHarness() {
  const [open, setOpen] = useState(true);
  const [selectedIds, setSelectedIds] = useState(["first", "second"]);
  const props = {
    projectId: "project",
    selectedObservationIds: selectedIds,
    query: { filter: [], orderBy: null },
    selectAll: false,
    totalCount: 10,
    onClose: () => setOpen(false),
    onSuccess: () => {
      submitted();
      setSelectedIds([]);
    },
  };
  return (
    <LayerProvider>
      <p>{selectedIds.length} rows selected</p>
      {open && <RunEvaluationDialog {...props} />}
    </LayerProvider>
  );
}

describe("Run evaluation lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submit.mockResolvedValue({ id: "batch-action" });
  });

  it("dismisses without changing the selected rows", () => {
    render(<SelectionHarness />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("2 rows selected")).toBeInTheDocument();
    expect(submitted).not.toHaveBeenCalled();
  });

  it("retains selection on failure and clears it once when retry succeeds", async () => {
    submit.mockRejectedValueOnce(new Error("Temporarily unavailable"));
    render(<SelectionHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Select Accuracy" }));
    fireEvent.click(screen.getByRole("button", { name: /Continue with/ }));
    fireEvent.click(screen.getByRole("button", { name: "Run Evaluation" }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(screen.getByText("2 rows selected")).toBeInTheDocument();
    expect(screen.getByText("Confirm evaluation")).toBeInTheDocument();
    expect(submitted).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Run Evaluation" }));
    await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1));
    expect(screen.getByText("0 rows selected")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
