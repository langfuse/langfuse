import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { TooltipProvider } from "@/src/components/ui/tooltip";
const mocks = vi.hoisted(() => ({
  createRule: vi.fn(),
  invalidateEvaluationRules: vi.fn(),
  showSuccessToast: vi.fn(),
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
  RuleFilterSearchBar: () => <div>Filter search bar</div>,
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

vi.mock("@/src/utils/trpcErrorToast", () => ({
  trpcErrorToast: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      evalsV2: {
        rules: { invalidate: mocks.invalidateEvaluationRules },
      },
    }),
    evalsV2: {
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
  });

  it("creates a standalone observation evaluation rule", async () => {
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

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Production observations" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create rule" }));

    await waitFor(() =>
      expect(mocks.createRule).toHaveBeenCalledWith({
        projectId: "project-1",
        name: "Production observations",
        targetObject: "event",
        filter: mocks.defaultFilters,
        sampling: 1,
        enabled: true,
      }),
    );
    expect(mocks.invalidateEvaluationRules).toHaveBeenCalledWith({
      projectId: "project-1",
    });
    expect(mocks.showSuccessToast).toHaveBeenCalledWith({
      title: "Rule created",
      description: "Evaluators can now be attached to Production observations.",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("can create a disabled evaluation rule", async () => {
    render(
      <TooltipProvider>
        <CreateEvaluationRuleDialog
          projectId="project-1"
          open
          onOpenChange={vi.fn()}
        />
      </TooltipProvider>,
    );

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Draft rule" },
    });
    fireEvent.click(
      screen.getByRole("switch", { name: "Enable evaluation rule" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Create rule" }));

    await waitFor(() =>
      expect(mocks.createRule).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false }),
      ),
    );
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

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Production observations" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Matching preview row" }),
    );

    expect(screen.getByText("Trace detail trace-1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to new rule" }));
    expect(screen.getByLabelText("Name")).toHaveValue(
      "Production observations",
    );
  });
});
