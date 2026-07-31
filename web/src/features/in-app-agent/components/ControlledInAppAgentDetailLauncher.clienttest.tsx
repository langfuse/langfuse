import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ControlledInAppAgentDetailLauncher } from "./ControlledInAppAgentDetailLauncher";
import { getInAppAgentFocusedQuickActions } from "@/src/features/in-app-agent/quickActions";

const openAssistant = vi.fn().mockReturnValue(true);
const submit = vi.fn().mockResolvedValue(true);

vi.mock("next/router", () => ({
  useRouter: () => ({ asPath: "/project/p-1/traces?peek=t-1" }),
}));

vi.mock("./InAppAiAgentProvider", () => ({
  useInAppAiAgent: () => ({
    open: false,
    setOpen: vi.fn(),
    isRunning: false,
    isSubmitting: false,
    openAssistant,
    submit,
  }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

// The launcher's own dropdown is covered by its Storybook interaction stories;
// here we only care what the container does with the selected action.
vi.mock("./InAppAgentDetailLauncher", () => ({
  InAppAgentDetailLauncher: ({
    quickActions,
    onSelectQuickAction,
  }: {
    quickActions: { id: string; prompt: string }[];
    onSelectQuickAction: (
      action: { id: string; prompt: string },
      position: number,
    ) => void;
  }) => (
    <button
      type="button"
      onClick={() => {
        onSelectQuickAction(quickActions[0], 0);
      }}
    >
      run first quick action
    </button>
  ),
}));

describe("ControlledInAppAgentDetailLauncher", () => {
  it("starts a fresh conversation for a peek quick action", async () => {
    const [firstAction] = getInAppAgentFocusedQuickActions("trace") ?? [];
    render(<ControlledInAppAgentDetailLauncher />);

    fireEvent.click(screen.getByRole("button"));

    // Without `newConversation`, the framed prompt would be appended to the
    // conversation still selected from an earlier, unrelated chat.
    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith(firstAction.prompt, {
        quickAction: { key: firstAction.id, category: "observability" },
        newConversation: true,
      });
    });
    expect(openAssistant).toHaveBeenCalledWith("detail_header");
  });
});
