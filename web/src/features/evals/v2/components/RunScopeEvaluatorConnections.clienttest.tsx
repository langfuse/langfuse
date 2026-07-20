import { fireEvent, render, screen } from "@testing-library/react";
import { decodeFiltersGeneric } from "@/src/features/filters/lib/filter-query-encoding";
import { getRunScopeTracesHref } from "@/src/features/evals/v2/lib/runScopeTracesHref";

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
      deleteEvaluators: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          isPending: false,
        }),
      },
    },
  },
}));

import { RunScopeEvaluatorConnections } from "./RunScopeEvaluatorConnections";

describe("RunScopeEvaluatorConnections", () => {
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

  it("links each evaluator to its execution traces for this run scope", () => {
    render(
      <RunScopeEvaluatorConnections
        projectId="project-1"
        runScopeId="scope-1"
        evaluators={[{ id: "evaluator/1", scoreName: "Quality" }]}
        hasWriteAccess
      />,
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
        value: "scope-1",
      },
    ]);

    fireEvent.keyDown(
      screen.getByRole("button", { name: "More actions for Quality" }),
      { key: "Enter" },
    );
    expect(
      screen.getByRole("menuitem", { name: "View evaluator" }),
    ).toHaveAttribute("href", "/project/project-1/evals/v2/evaluator%2F1");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeEnabled();
  });

  it("can link to evaluation traces across every evaluator in a run scope", () => {
    const href = getRunScopeTracesHref({
      projectId: "project-1",
      runScopeId: "scope-1",
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
        value: "scope-1",
      },
    ]);
  });
});
