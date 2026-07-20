import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { TooltipProvider } from "@/src/components/ui/tooltip";

const mocks = vi.hoisted(() => ({
  deleteScope: vi.fn(),
  evalsInvalidate: vi.fn(),
  runScopesInvalidate: vi.fn(),
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
      evals: { invalidate: mocks.evalsInvalidate },
      evalsV2: {
        runScopes: { invalidate: mocks.runScopesInvalidate },
      },
    }),
    evalsV2: {
      deleteRunScope: {
        useMutation: () => ({
          mutateAsync: mocks.deleteScope,
          isPending: false,
        }),
      },
    },
  },
}));

import { DeleteRunScopeButton } from "./DeleteRunScopeButton";

describe("DeleteRunScopeButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteScope.mockResolvedValue({ id: "scope-1" });
    mocks.evalsInvalidate.mockResolvedValue(undefined);
    mocks.runScopesInvalidate.mockResolvedValue(undefined);
  });

  it("renders an accessible icon-only action and confirms connected deletion", async () => {
    const onDeleted = vi.fn();
    render(
      <TooltipProvider>
        <DeleteRunScopeButton
          projectId="project-1"
          runScope={{
            id: "scope-1",
            name: "Production",
            evaluatorCount: 1,
          }}
          iconOnly
          onDeleted={onDeleted}
        />
      </TooltipProvider>,
    );

    const trigger = screen.getByRole("button", { name: "Delete run scope" });
    expect(trigger).toHaveTextContent("");
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Delete run scope?" });
    expect(
      within(dialog).getByText(
        /left without another run scope will become inactive/i,
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete run scope" }),
    );

    await waitFor(() =>
      expect(mocks.deleteScope).toHaveBeenCalledWith({
        projectId: "project-1",
        runScopeId: "scope-1",
      }),
    );
    expect(onDeleted).toHaveBeenCalledOnce();
  });
});
