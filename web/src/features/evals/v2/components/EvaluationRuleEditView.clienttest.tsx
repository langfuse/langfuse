import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import { TooltipProvider } from "@/src/components/ui/tooltip";

const mocks = vi.hoisted(() => ({
  updateRule: vi.fn(),
  attachEvaluatorToRule: vi.fn(),
  detachEvaluatorFromRule: vi.fn(),
  evalsInvalidate: vi.fn(),
  evalsV2Invalidate: vi.fn(),
  showSuccessToast: vi.fn(),
}));

vi.mock("@/src/features/evals/v2/components/EvaluationRuleSection", () => ({
  EXAMPLE_FILTERS: [],
  mergeExampleFilters: vi.fn(),
  RuleFilterSearchBar: ({
    setFilterState,
  }: {
    setFilterState: (filters: unknown[]) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        setFilterState([
          {
            column: "environment",
            type: "stringOptions",
            operator: "any of",
            value: ["production"],
          },
        ])
      }
    >
      Change filters
    </button>
  ),
}));

vi.mock(
  "@/src/features/evals/v2/components/EvaluationRulePreviewTable",
  () => ({
    EvaluationRulePreviewTable: ({
      onSelectObservation,
    }: {
      onSelectObservation?: (row: {
        id: string;
        traceId: string;
        startTime: Date;
      }) => void;
    }) => (
      <button
        type="button"
        onClick={() =>
          onSelectObservation?.({
            id: "observation-1",
            traceId: "trace-1",
            startTime: new Date("2026-07-20T12:00:00.000Z"),
          })
        }
      >
        Matching preview row
      </button>
    ),
  }),
);

vi.mock("@/src/components/ui/slider", () => ({
  Slider: ({ disabled }: { disabled?: boolean }) => (
    <div data-disabled={disabled}>Sampling slider</div>
  ),
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
      evalsV2: {
        invalidate: mocks.evalsV2Invalidate,
      },
    }),
    evalsV2: {
      updateRule: {
        useMutation: () => ({
          mutateAsync: mocks.updateRule,
          isPending: false,
        }),
      },
      attachEvaluatorToRule: {
        useMutation: () => ({
          mutateAsync: mocks.attachEvaluatorToRule,
        }),
      },
      detachEvaluatorFromRule: {
        useMutation: () => ({
          mutateAsync: mocks.detachEvaluatorFromRule,
          isPending: false,
        }),
      },
      evaluatorOptions: {
        useQuery: () => ({ data: [] }),
      },
    },
  },
}));

import { EvaluationRuleEditView } from "./EvaluationRuleEditView";

const rule = {
  id: "rule-1",
  name: "Production",
  filter: [],
  sampling: 1,
  enabled: true,
  evaluators: [{ id: "evaluator-1", scoreName: "Quality" }],
};

describe("EvaluationRuleEditView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateRule.mockResolvedValue({ id: rule.id });
    mocks.attachEvaluatorToRule.mockResolvedValue(undefined);
    mocks.detachEvaluatorFromRule.mockResolvedValue(undefined);
    mocks.evalsInvalidate.mockResolvedValue(undefined);
    mocks.evalsV2Invalidate.mockResolvedValue(undefined);
  });

  it("keeps save disabled until the rule changes", () => {
    render(
      <TooltipProvider>
        <EvaluationRuleEditView
          projectId="project-1"
          evaluationRule={rule}
          timeRange={null}
          onCancel={vi.fn()}
          onSaved={vi.fn()}
          onOpenTrace={vi.fn()}
        />
      </TooltipProvider>,
    );

    const saveButton = screen.getByRole("button", { name: "Save changes" });
    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Step 4: Name rule" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Production traces" },
    });
    expect(saveButton).toBeEnabled();
  });

  it("uses the edit form as a read-only rule view", () => {
    render(
      <TooltipProvider>
        <EvaluationRuleEditView
          projectId="project-1"
          evaluationRule={rule}
          timeRange={null}
          onCancel={vi.fn()}
          onSaved={vi.fn()}
          onOpenTrace={vi.fn()}
          readOnly
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Step 4: Name rule" }));
    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.getByText("Sampling slider")).toHaveAttribute(
      "data-disabled",
      "true",
    );
  });

  it("confirms before saving changes to a connected evaluation rule", async () => {
    const onSaved = vi.fn();
    render(
      <TooltipProvider>
        <EvaluationRuleEditView
          projectId="project-1"
          evaluationRule={rule}
          timeRange={null}
          onCancel={vi.fn()}
          onSaved={onSaved}
          onOpenTrace={vi.fn()}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Step 4: Name rule" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Production traces" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mocks.updateRule).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", {
      name: "Save rule used by evaluators?",
    });
    expect(
      within(dialog).getByText(/1 evaluator is attached/i),
    ).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() =>
      expect(mocks.updateRule).toHaveBeenCalledWith({
        projectId: "project-1",
        ruleId: "rule-1",
        name: "Production traces",
        filter: [],
        sampling: 1,
      }),
    );
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("saves an unconnected evaluation rule without a confirmation", async () => {
    render(
      <TooltipProvider>
        <EvaluationRuleEditView
          projectId="project-1"
          evaluationRule={{ ...rule, evaluators: [] }}
          timeRange={null}
          onCancel={vi.fn()}
          onSaved={vi.fn()}
          onOpenTrace={vi.fn()}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Change filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.updateRule).toHaveBeenCalledOnce());
    expect(
      screen.queryByRole("dialog", { name: "Save rule used by evaluators?" }),
    ).not.toBeInTheDocument();
  });

  it("opens the clicked matching observation's trace", () => {
    const onOpenTrace = vi.fn();
    render(
      <TooltipProvider>
        <EvaluationRuleEditView
          projectId="project-1"
          evaluationRule={rule}
          timeRange={null}
          onCancel={vi.fn()}
          onSaved={vi.fn()}
          onOpenTrace={onOpenTrace}
        />
      </TooltipProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Matching preview row" }),
    );

    expect(onOpenTrace).toHaveBeenCalledWith("trace-1");
  });
});
