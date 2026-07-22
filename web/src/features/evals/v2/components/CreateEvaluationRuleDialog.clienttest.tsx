import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { type FilterState } from "@langfuse/shared";

import { TooltipProvider } from "@/src/components/ui/tooltip";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
});

const mocks = vi.hoisted(() => ({
  createRule: vi.fn(),
  invalidateEvaluationRules: vi.fn(),
  invalidateEvaluators: vi.fn(),
  showSuccessToast: vi.fn(),
  capture: vi.fn(),
  getEvaluator: vi.fn(),
  getSample: vi.fn(),
  runLlmTest: vi.fn(),
  defaultFilters: [
    {
      column: "environment",
      type: "string",
      operator: "does not contain",
      value: "langfuse-",
    },
  ],
}));

vi.mock("@/src/features/evals/v2/components/EvaluationRuleSection", () => ({
  EVALUATION_OBSERVATION_EXCLUSION_FILTERS: mocks.defaultFilters,
  EXAMPLE_FILTERS: [],
  mergeExampleFilters: vi.fn(),
  generateEvaluationRuleName: () => "All production generations",
  RuleFilterSearchBar: ({
    setFilterState,
  }: {
    setFilterState: (filters: FilterState) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        setFilterState([
          {
            column: "type",
            type: "stringOptions",
            operator: "any of",
            value: ["GENERATION"],
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

vi.mock("@/src/components/table/peek/hooks/usePeekData", () => ({
  usePeekData: ({ traceId }: { traceId?: string }) => ({
    data: traceId ? { id: traceId, name: "Sample trace" } : undefined,
  }),
}));

vi.mock("@/src/components/trace/TraceDetailBody", () => ({
  traceDetailTitle: (
    trace: { id: string; name?: string } | undefined,
    fallback?: string,
  ) => (trace?.name ? `${trace.name}: ${trace.id}` : fallback),
  TraceDetailBody: ({ trace }: { trace?: { id: string } }) =>
    trace ? <div>Trace detail {trace.id}</div> : null,
}));

vi.mock("@/src/components/ui/slider", () => ({
  Slider: () => <div>Sampling slider</div>,
}));

vi.mock("@/src/hooks/useTableDateRange", () => ({
  useTableDateRange: () => ({
    timeRange: {
      from: new Date("2026-07-13T00:00:00.000Z"),
      to: new Date("2026-07-20T00:00:00.000Z"),
    },
  }),
}));

vi.mock("@/src/features/notifications/showSuccessToast", () => ({
  showSuccessToast: mocks.showSuccessToast,
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));

vi.mock("@/src/utils/trpcErrorToast", () => ({
  trpcErrorToast: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      client: {
        evals: { configById: { query: mocks.getEvaluator } },
        events: { all: { query: mocks.getSample } },
        evalsV2: {
          testRunLlmJudge: { mutate: mocks.runLlmTest },
          testRunCodeEval: { mutate: vi.fn() },
        },
      },
      evalsV2: {
        rules: { invalidate: mocks.invalidateEvaluationRules },
        invalidate: mocks.invalidateEvaluators,
      },
    }),
    evalsV2: {
      rules: {
        useQuery: () => ({ data: [] }),
      },
      evaluatorOptions: {
        useQuery: () => ({
          data: [
            {
              id: "evaluator-1",
              scoreName: "Correctness",
              targetObject: "event",
              status: "ACTIVE",
              evalTemplate: { type: "LLM_AS_JUDGE" },
            },
            {
              id: "evaluator-2",
              scoreName: "Relevance",
              targetObject: "event",
              status: "ACTIVE",
              evalTemplate: { type: "LLM_AS_JUDGE" },
            },
          ],
          isPending: false,
        }),
      },
      testRunCodeEval: {
        useMutation: () => ({ mutateAsync: vi.fn() }),
      },
      createRule: {
        useMutation: () => ({
          mutateAsync: mocks.createRule,
          isPending: false,
        }),
      },
    },
  },
}));

import { CreateEvaluationRuleDialog } from "./CreateEvaluationRuleDialog";

describe("CreateEvaluationRuleDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRule.mockResolvedValue({ id: "rule-1" });
    mocks.invalidateEvaluationRules.mockResolvedValue(undefined);
    mocks.invalidateEvaluators.mockResolvedValue(undefined);
    mocks.getEvaluator.mockResolvedValue({
      scoreName: "Correctness",
      targetObject: "event",
      variableMapping: [
        {
          templateVariable: "input",
          selectedColumnId: "input",
          jsonSelector: null,
        },
      ],
      evalTemplate: {
        id: "template-1",
        type: "LLM_AS_JUDGE",
        prompt: "Judge {{input}}",
        sourceCode: null,
        sourceCodeLanguage: null,
        provider: null,
        model: null,
        modelParams: null,
        outputDefinition: null,
      },
    });
    mocks.getSample.mockResolvedValue({
      observations: [
        {
          id: "observation-1",
          traceId: "trace-1",
          startTime: new Date("2026-07-20T12:00:00.000Z"),
        },
      ],
    });
    mocks.runLlmTest.mockResolvedValue({ success: true });
  });

  it("keeps every step available without placeholder summaries", () => {
    render(
      <TooltipProvider>
        <CreateEvaluationRuleDialog
          projectId="project-1"
          open
          onOpenChange={vi.fn()}
        />
      </TooltipProvider>,
    );

    const samplingStep = screen.getByRole("button", {
      name: "Step 2: Set sampling rate",
    });
    expect(screen.getByRole("dialog", { name: "New rule" })).toHaveClass(
      "max-w-6xl",
    );
    const evaluatorStep = screen.getByRole("button", {
      name: "Step 3: Attach evaluator",
    });
    const nameStep = screen.getByRole("button", {
      name: "Step 4: Name rule",
    });
    expect(samplingStep).toBeEnabled();
    expect(within(samplingStep).queryByText("100%")).not.toBeInTheDocument();
    expect(evaluatorStep).toBeEnabled();
    expect(nameStep).toBeEnabled();
    expect(
      screen.queryByText("Available after evaluator validation"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    expect(screen.queryByText("Sampling slider")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Attach evaluator" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Evaluators").tagName).toBe("LABEL");
    fireEvent.click(nameStep);
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  it("requires a validated evaluator before naming and creating the rule", async () => {
    const onOpenChange = vi.fn();
    render(
      <TooltipProvider>
        <CreateEvaluationRuleDialog
          projectId="project-1"
          open
          onOpenChange={onOpenChange}
        />
      </TooltipProvider>,
    );

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Attach evaluator" }));
    fireEvent.click(screen.getByText("Correctness"));
    expect(await screen.findByLabelText("Name")).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Selected evaluators" }),
    ).toHaveTextContent("Correctness");
    expect(
      screen.getByRole("button", { name: "Remove Correctness" }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Attach evaluator" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Attach evaluator" }));
    fireEvent.click(screen.getByText("Relevance"));

    const nameInput = await screen.findByLabelText("Name");
    expect(nameInput).toHaveValue("All production generations");
    fireEvent.change(nameInput, {
      target: { value: "Production observations" },
    });
    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    await waitFor(() =>
      expect(mocks.createRule).toHaveBeenCalledWith({
        projectId: "project-1",
        name: "Production observations",
        targetObject: "event",
        filter: mocks.defaultFilters,
        sampling: 1,
        enabled: true,
        evaluatorIds: ["evaluator-1", "evaluator-2"],
      }),
    );
    expect(mocks.invalidateEvaluationRules).toHaveBeenCalledWith({
      projectId: "project-1",
    });
    expect(mocks.showSuccessToast).toHaveBeenCalledWith({
      title: "Rule created",
      description:
        "Production observations is active with 2 evaluators attached.",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("opens later steps progressively and lets every unlocked step collapse and reopen", async () => {
    render(
      <TooltipProvider>
        <CreateEvaluationRuleDialog
          projectId="project-1"
          open
          onOpenChange={vi.fn()}
        />
      </TooltipProvider>,
    );

    const observationsStep = screen.getByRole("button", {
      name: "Step 1: Choose observations",
    });
    fireEvent.click(observationsStep);
    expect(
      screen.queryByRole("button", { name: "Change filters" }),
    ).not.toBeInTheDocument();
    fireEvent.click(observationsStep);
    expect(
      screen.getByRole("button", { name: "Change filters" }),
    ).toBeInTheDocument();

    expect(screen.queryByText("Sampling slider")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Step 2: Set sampling rate" }),
    );
    expect(screen.getByText("Sampling slider")).toBeInTheDocument();

    const evaluatorStep = screen.getByRole("button", {
      name: "Step 3: Attach evaluator",
    });
    fireEvent.click(evaluatorStep);
    expect(
      screen.queryByRole("button", { name: "Attach evaluator" }),
    ).not.toBeInTheDocument();
    fireEvent.click(evaluatorStep);
    fireEvent.click(screen.getByRole("button", { name: "Attach evaluator" }));
    fireEvent.click(screen.getByText("Correctness"));

    expect(await screen.findByLabelText("Name")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Attach evaluator" }),
    ).toBeInTheDocument();
    const nameStep = screen.getByRole("button", {
      name: "Step 4: Name rule",
    });
    fireEvent.click(nameStep);
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    fireEvent.click(nameStep);
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  it("requires evaluator validation again after filters change", async () => {
    render(
      <TooltipProvider>
        <CreateEvaluationRuleDialog
          projectId="project-1"
          open
          onOpenChange={vi.fn()}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Attach evaluator" }));
    fireEvent.click(screen.getByText("Correctness"));
    expect(await screen.findByLabelText("Name")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Change filters" }));

    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Validate selected evaluators" }),
    ).toBeInTheDocument();
  });

  it("opens a matching observation's trace without discarding the rule draft", () => {
    render(
      <TooltipProvider>
        <CreateEvaluationRuleDialog
          projectId="project-1"
          open
          onOpenChange={vi.fn()}
        />
      </TooltipProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Matching preview row" }),
    );

    expect(screen.getByText("Trace detail trace-1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to new rule" }));
    expect(
      screen.getByRole("button", { name: "Attach evaluator" }),
    ).toBeInTheDocument();
  });
});
