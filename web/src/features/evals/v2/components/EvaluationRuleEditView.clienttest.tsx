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
  evalsInvalidate: vi.fn(),
  evalsV2Invalidate: vi.fn(),
  showSuccessToast: vi.fn(),
  attachEvaluator: vi.fn(),
  detachEvaluator: vi.fn(),
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
  Slider: () => <div>Sampling slider</div>,
}));

vi.mock("@/src/features/notifications/showSuccessToast", () => ({
  showSuccessToast: mocks.showSuccessToast,
}));

vi.mock("@/src/features/evals/v2/hooks/useValidatedRuleAttachment", () => ({
  useValidatedRuleAttachment: () => ({
    attach: mocks.attachEvaluator,
    pendingKey: null,
    issue: null,
  }),
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
      evaluatorOptions: {
        useQuery: () => ({ data: [] }),
      },
      detachEvaluatorFromRule: {
        useMutation: () => ({
          mutateAsync: mocks.detachEvaluator,
          isPending: false,
        }),
      },
      updateRule: {
        useMutation: () => ({
          mutateAsync: mocks.updateRule,
          isPending: false,
        }),
      },
      setRulesEnabled: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
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
    mocks.evalsInvalidate.mockResolvedValue(undefined);
    mocks.evalsV2Invalidate.mockResolvedValue(undefined);
    mocks.attachEvaluator.mockResolvedValue(true);
    mocks.detachEvaluator.mockResolvedValue({ evaluatorId: "evaluator-1" });
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

    expect(
      screen.getByRole("button", { name: "Step 1: Choose observations" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Step 2: Attach evaluator" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Step 3: Name rule" }),
    ).toBeInTheDocument();

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
