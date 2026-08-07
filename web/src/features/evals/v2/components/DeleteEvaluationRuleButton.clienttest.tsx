import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { TooltipProvider } from "@/src/components/ui/tooltip";

const mocks = vi.hoisted(() => ({
  deleteRule: vi.fn(),
  evalsInvalidate: vi.fn(),
  rulesInvalidate: vi.fn(),
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
        rules: { invalidate: mocks.rulesInvalidate },
      },
    }),
    evalsV2: {
      deleteRule: {
        useMutation: () => ({
          mutateAsync: mocks.deleteRule,
          isPending: false,
        }),
      },
    },
  },
}));

import { DeleteEvaluationRuleButton } from "./DeleteEvaluationRuleButton";

describe("DeleteEvaluationRuleButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteRule.mockResolvedValue({ id: "rule-1" });
    mocks.evalsInvalidate.mockResolvedValue(undefined);
    mocks.rulesInvalidate.mockResolvedValue(undefined);
  });

  it("renders an accessible icon-only action and confirms connected deletion", async () => {
    const onDeleted = vi.fn();
    render(
      <TooltipProvider>
        <DeleteEvaluationRuleButton
          projectId="project-1"
          evaluationRule={{
            id: "rule-1",
            name: "Production",
            evaluatorCount: 1,
          }}
          iconOnly
          onDeleted={onDeleted}
        />
      </TooltipProvider>,
    );

    const trigger = screen.getByRole("button", { name: "Delete rule" });
    expect(trigger).toHaveTextContent("");
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Delete rule?" });
    expect(
      within(dialog).getByText(
        /left without another evaluation rule will become inactive/i,
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete rule" }),
    );

    await waitFor(() =>
      expect(mocks.deleteRule).toHaveBeenCalledWith({
        projectId: "project-1",
        ruleId: "rule-1",
      }),
    );
    expect(onDeleted).toHaveBeenCalledOnce();
  });
});
