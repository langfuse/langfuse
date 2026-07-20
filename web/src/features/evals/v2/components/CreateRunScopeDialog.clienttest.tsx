import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  createRunScope: vi.fn(),
  invalidateRunScopes: vi.fn(),
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

vi.mock("@/src/features/evals/v2/components/RunScopeSection", () => ({
  EVALUATION_OBSERVATION_EXCLUSION_FILTERS: mocks.defaultFilters,
  ScopeFilterSearchBar: () => <div>Filter search bar</div>,
}));

vi.mock("@/src/features/evals/v2/components/ScopePreviewTable", () => ({
  ScopePreviewTable: () => <div>Matching preview</div>,
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
        runScopes: { invalidate: mocks.invalidateRunScopes },
      },
    }),
    evalsV2: {
      createRunScope: {
        useMutation: () => ({
          mutateAsync: mocks.createRunScope,
          isPending: false,
        }),
      },
    },
  },
}));

import { CreateRunScopeDialog } from "./CreateRunScopeDialog";

describe("CreateRunScopeDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRunScope.mockResolvedValue({ id: "scope-1" });
    mocks.invalidateRunScopes.mockResolvedValue(undefined);
  });

  it("creates a standalone observation run scope", async () => {
    const onOpenChange = vi.fn();
    render(
      <CreateRunScopeDialog
        projectId="project-1"
        open
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Production observations" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create run scope" }));

    await waitFor(() =>
      expect(mocks.createRunScope).toHaveBeenCalledWith({
        projectId: "project-1",
        name: "Production observations",
        targetObject: "event",
        filter: mocks.defaultFilters,
        sampling: 1,
      }),
    );
    expect(mocks.invalidateRunScopes).toHaveBeenCalledWith({
      projectId: "project-1",
    });
    expect(mocks.showSuccessToast).toHaveBeenCalledWith({
      title: "Run scope created",
      description: "Production observations is ready to attach to evaluators.",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
