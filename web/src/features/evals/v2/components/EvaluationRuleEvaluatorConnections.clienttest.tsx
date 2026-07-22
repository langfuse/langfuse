import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import { decodeFiltersGeneric } from "@/src/features/filters/lib/filter-query-encoding";
import { getEvaluationRuleTracesHref } from "@/src/features/evals/v2/lib/evaluationRuleTracesHref";

const mocks = vi.hoisted(() => ({
  detachEvaluator: vi.fn(),
}));

vi.mock("@/src/features/notifications/showSuccessToast", () => ({
  showSuccessToast: vi.fn(),
}));

vi.mock("@/src/utils/trpcErrorToast", () => ({
  trpcErrorToast: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      evals: { invalidate: vi.fn() },
      evalsV2: { invalidate: vi.fn() },
    }),
    evalsV2: {
      detachEvaluatorFromRule: {
        useMutation: () => ({
          mutateAsync: mocks.detachEvaluator,
          isPending: false,
        }),
      },
    },
  },
}));

import { EvaluationRuleEvaluatorConnections } from "./EvaluationRuleEvaluatorConnections";

describe("EvaluationRuleEvaluatorConnections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("links each evaluator to its execution traces for this evaluation rule", () => {
    render(
      <EvaluationRuleEvaluatorConnections
        projectId="project-1"
        ruleId="rule-1"
        evaluators={[{ id: "evaluator/1", scoreName: "Quality" }]}
        hasWriteAccess
      />,
      { wrapper: TooltipProvider },
    );

    expect(
      screen.getByRole("list", { name: "Attached evaluators" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Quality" })).toHaveAttribute(
      "href",
      "/project/project-1/evals/v2/evaluator%2F1",
    );
    const tracesLink = screen.getByRole("link", {
      name: "View execution traces for Quality",
    });
    const tracesUrl = new URL(
      tracesLink.getAttribute("href") ?? "",
      "https://langfuse.local",
    );
    expect(tracesUrl.pathname).toBe("/project/project-1/traces");
    expect(
      decodeFiltersGeneric(tracesUrl.searchParams.get("filter") ?? ""),
    ).toEqual([
      {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: ["langfuse-llm-as-a-judge", "langfuse-code-eval"],
      },
      {
        column: "metadata",
        type: "stringObject",
        key: "job_configuration_id",
        operator: "=",
        value: "evaluator/1",
      },
      {
        column: "metadata",
        type: "stringObject",
        key: "run_scope_id",
        operator: "=",
        value: "rule-1",
      },
    ]);

    fireEvent.keyDown(
      screen.getByRole("button", { name: "More actions for Quality" }),
      { key: "Enter" },
    );
    expect(
      screen.getByRole("menuitem", { name: "View evaluator" }),
    ).toHaveAttribute("href", "/project/project-1/evals/v2/evaluator%2F1");
    expect(screen.getByRole("menuitem", { name: "Detach" })).toBeEnabled();
  });

  it("can link to evaluation traces across every evaluator in an evaluation rule", () => {
    const href = getEvaluationRuleTracesHref({
      projectId: "project-1",
      ruleId: "rule-1",
    });

    expect(href.pathname).toBe("/project/project-1/traces");
    expect(decodeFiltersGeneric(href.query.filter)).toEqual([
      {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: ["langfuse-llm-as-a-judge", "langfuse-code-eval"],
      },
      {
        column: "metadata",
        type: "stringObject",
        key: "run_scope_id",
        operator: "=",
        value: "rule-1",
      },
    ]);
  });

  it("detaches the evaluator from this rule without deleting it", () => {
    render(
      <EvaluationRuleEvaluatorConnections
        projectId="project-1"
        ruleId="rule-1"
        evaluators={[{ id: "evaluator-1", scoreName: "Quality" }]}
        hasWriteAccess
      />,
      { wrapper: TooltipProvider },
    );

    fireEvent.keyDown(
      screen.getByRole("button", { name: "More actions for Quality" }),
      { key: "Enter" },
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Detach" }));
    fireEvent.click(screen.getByRole("button", { name: "Detach" }));

    expect(mocks.detachEvaluator).toHaveBeenCalledWith({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      ruleId: "rule-1",
    });
  });
});
