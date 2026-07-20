import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  updateScope: vi.fn(),
  evalsInvalidate: vi.fn(),
  evalsV2Invalidate: vi.fn(),
  showSuccessToast: vi.fn(),
}));

vi.mock("@/src/features/evals/v2/components/RunScopeSection", () => ({
  ScopeFilterSearchBar: ({
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

vi.mock("@/src/features/evals/v2/components/ScopePreviewTable", () => ({
  ScopePreviewTable: () => <div>Matching preview</div>,
}));

vi.mock("@/src/components/ui/slider", () => ({
  Slider: () => <div>Sampling slider</div>,
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
      updateRunScope: {
        useMutation: () => ({
          mutateAsync: mocks.updateScope,
          isPending: false,
        }),
      },
    },
  },
}));

import { RunScopeEditView } from "./RunScopeEditView";

const scope = {
  id: "scope-1",
  name: "Production",
  filter: [],
  sampling: 1,
  evaluators: [{ id: "evaluator-1", scoreName: "Quality" }],
};

describe("RunScopeEditView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateScope.mockResolvedValue({ id: scope.id });
    mocks.evalsInvalidate.mockResolvedValue(undefined);
    mocks.evalsV2Invalidate.mockResolvedValue(undefined);
  });

  it("confirms before saving changes to a connected run scope", async () => {
    const onSaved = vi.fn();
    render(
      <RunScopeEditView
        projectId="project-1"
        runScope={scope}
        timeRange={null}
        onCancel={vi.fn()}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Production traces" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mocks.updateScope).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", {
      name: "Save connected run scope?",
    });
    expect(
      within(dialog).getByText(/connected to 1 evaluator/i),
    ).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() =>
      expect(mocks.updateScope).toHaveBeenCalledWith({
        projectId: "project-1",
        runScopeId: "scope-1",
        name: "Production traces",
        filter: [],
        sampling: 1,
      }),
    );
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("saves an unconnected run scope without a confirmation", async () => {
    render(
      <RunScopeEditView
        projectId="project-1"
        runScope={{ ...scope, evaluators: [] }}
        timeRange={null}
        onCancel={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Change filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.updateScope).toHaveBeenCalledOnce());
    expect(
      screen.queryByRole("dialog", { name: "Save connected run scope?" }),
    ).not.toBeInTheDocument();
  });
});
