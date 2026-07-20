import { fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  detachMutate: vi.fn(),
}));

vi.mock("@/src/features/filters/components/filter-builder", () => ({
  InlineFilterState: () => <span>Filters</span>,
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
      evals: { configById: { invalidate: vi.fn() } },
      evalsV2: { invalidate: vi.fn() },
    }),
    evalsV2: {
      runScopes: {
        useQuery: () => ({
          data: [
            { id: "scope-1", name: "Attached scope", targetObject: "event" },
            {
              id: "scope-2",
              name: "Available scope",
              targetObject: "event",
            },
          ],
          isPending: false,
        }),
      },
      detachEvaluatorFromRunScope: {
        useMutation: () => ({
          mutate: mocks.detachMutate,
          isPending: false,
        }),
      },
    },
  },
}));

import { EvaluatorRunScopeAssignments } from "./EvaluatorRunScopeAssignments";

describe("EvaluatorRunScopeAssignments", () => {
  beforeAll(() => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
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

  it("chooses between creating and attaching a run scope", () => {
    const onAttach = vi.fn();
    render(
      <EvaluatorRunScopeAssignments
        projectId="project-1"
        evaluatorId="evaluator-1"
        runScopes={[{ id: "scope-1", name: "Attached scope", filter: [] }]}
        hasWriteAccess
        onAttach={onAttach}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Attach run scope" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /Create new run scope/ }),
    );
    expect(onAttach).toHaveBeenCalledWith(undefined, true);

    fireEvent.click(screen.getByRole("button", { name: "Attach run scope" }));
    fireEvent.click(screen.getByText("Available scope"));
    expect(onAttach).toHaveBeenLastCalledWith("scope-2");
  });
});
