import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ScanSearch } from "lucide-react";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import {
  InAppAgentWindow,
  type InAppAgentWindowProps,
} from "./InAppAgentWindow";
import { ControlledInAppAgentWindow } from "../ControlledInAppAgentWindow/ControlledInAppAgentWindow";

const capture = vi.fn();
const controlledAgent = vi.hoisted(() => ({
  value: {
    conversations: [],
    error: null,
    hasMoreConversations: false,
    isLoadingMoreConversations: false,
    isRunning: true,
    isSelectedConversationHydrating: false,
    isSubmitting: false,
    invalidateConversations: vi.fn(),
    liveMessageVersion: 0,
    loadMoreConversations: vi.fn(),
    messages: [],
    pendingToolApprovals: [] as Array<{ id: string }>,
    approveToolCall: vi.fn(),
    rejectToolCall: vi.fn(),
    selectedConversationId: undefined,
    selectedConversationIsWriteLocked: false,
    submit: vi.fn(),
    submitFeedback: vi.fn(),
  },
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => capture,
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ asPath: "/" }),
}));

vi.mock("./InAppAiAgentProvider", () => ({
  useInAppAiAgent: () => controlledAgent.value,
}));

vi.mock("./useSmoothStreamingMessages", () => ({
  useSmoothStreamingMessages: () => ({
    isAnimating: false,
    messages: [],
    pendingToolApprovals: [],
    runningToolCallIds: [],
  }),
}));

// jsdom does not implement Element scrolling.
Element.prototype.scrollTo = vi.fn();

function windowElement(
  overrides: Partial<
    Omit<InAppAgentWindowProps, "showCloseButton" | "onClose">
  > = {},
) {
  const props: InAppAgentWindowProps = {
    conversations: [],
    error: null,
    hasMoreConversations: false,
    isAssistantTurnInProgress: false,
    isExpanded: false,
    isConversationInteractionDisabled: false,
    isLoadingMoreConversations: false,
    messages: [],
    onApproveToolCall: vi.fn(),
    onDeleteConversation: vi.fn(),
    onExpandedChange: vi.fn(),
    onLoadMoreConversations: vi.fn(),
    onNewConversation: vi.fn(),
    onOpenConversationHistory: vi.fn(),
    onRejectToolCall: vi.fn(),
    onSelectConversation: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(true),
    onSubmitFeedback: vi.fn(),
    quickActionContext: "observability",
    quickActionResetKey: "/project/project-1/traces",
    screenContextDescription: { type: "trace-list", hasAppliedFilters: true },
    selectedConversationId: undefined,
    ...overrides,
    showCloseButton: false,
  };

  return (
    <TooltipProvider>
      <InAppAgentWindow {...props} />
    </TooltipProvider>
  );
}

function selectTab(name: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }), {
    button: 0,
    ctrlKey: false,
  });
}

describe("InAppAgentWindow quick actions", () => {
  it("switches tabs, resets on route change, and submits the action prompt with attribution", async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    const { rerender } = render(windowElement({ onSubmit }));

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Observability",
      "Prompts",
      "Evaluation",
      "Dashboard",
    ]);
    expect(screen.getByRole("tab", { name: "Observability" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    selectTab("Prompts");
    expect(screen.getByRole("tab", { name: "Prompts" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    rerender(
      windowElement({
        onSubmit,
        quickActionResetKey: "/project/project-1/observations",
      }),
    );
    expect(screen.getByRole("tab", { name: "Observability" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    selectTab("Prompts");
    fireEvent.click(screen.getByRole("button", { name: /^Create a prompt/ }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "Help me create a new prompt in Langfuse prompt management, including choosing between a text and chat prompt, defining its variables, and setting a label.",
        {
          quickAction: {
            key: "create-prompt",
            category: "prompts",
          },
        },
      );
    });
    expect(capture).toHaveBeenCalledWith("in_app_agent:quick_action_started", {
      quickActionKey: "create-prompt",
      quickActionCategory: "prompts",
      position: 0,
    });
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("shows focused actions on the initial tab and coarse actions elsewhere", () => {
    render(
      windowElement({
        focusedQuickActions: [
          {
            id: "analyze-this-trace",
            label: "Analyze this trace",
            description: "Run structured error analysis on this trace",
            icon: ScanSearch,
            prompt: "Analyze this trace.",
          },
        ],
        quickActionResetKey: "/project/project-1/traces/trace-1",
        screenContextDescription: { type: "trace" },
      }),
    );

    expect(
      screen.getByRole("button", { name: /^Analyze this trace/ }),
    ).toBeInTheDocument();

    selectTab("Prompts");
    expect(
      screen.getByRole("button", { name: /^Create a prompt/ }),
    ).toBeInTheDocument();
  });
});

describe("ControlledInAppAgentWindow composer", () => {
  it("keeps a draft editable but prevents submitting it while rate limited", () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(
      windowElement({
        error: { type: "rate_limit", retryAt: Date.now() + 60_000 },
        onSubmit,
      }),
    );

    const input = screen.getByRole("textbox", {
      name: "Message the assistant",
    });
    fireEvent.change(input, { target: { value: "Follow up" } });

    expect(input).toHaveValue("Follow up");
    expect(input).toBeEnabled();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();

    const form = input.closest("form");
    if (!form) {
      throw new Error("Expected the assistant composer to render a form");
    }

    fireEvent.submit(form);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps a draft editable but prevents submitting it while an assistant turn is active", () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    controlledAgent.value.isRunning = true;
    controlledAgent.value.pendingToolApprovals = [];
    controlledAgent.value.submit = onSubmit;
    render(
      <TooltipProvider>
        <ControlledInAppAgentWindow
          isExpanded={false}
          onClose={vi.fn()}
          onDeleteConversation={vi.fn()}
          onExpandedChange={vi.fn()}
        />
      </TooltipProvider>,
    );

    const input = screen.getByRole("textbox", {
      name: "Message the assistant",
    });
    fireEvent.change(input, { target: { value: "Follow up" } });

    expect(input).toHaveValue("Follow up");
    expect(input).toBeEnabled();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();

    const form = input.closest("form");
    if (!form) {
      throw new Error("Expected the assistant composer to render a form");
    }

    fireEvent.submit(form);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps navigation disabled while an approval is pending", () => {
    controlledAgent.value.isRunning = false;
    controlledAgent.value.pendingToolApprovals = [{ id: "approval-1" }];
    controlledAgent.value.submit = vi.fn();

    render(
      <TooltipProvider>
        <ControlledInAppAgentWindow
          isExpanded={false}
          onClose={vi.fn()}
          onDeleteConversation={vi.fn()}
          onExpandedChange={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(
      screen.getByRole("textbox", { name: "Message the assistant" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Start new conversation" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Conversation history" }),
    ).toBeDisabled();
  });
});

describe("InAppAgentWindow focus", () => {
  it("refocuses the composer when an active turn completes", () => {
    const { rerender } = render(
      <>
        <button type="button">Other control</button>
        {windowElement({ isAssistantTurnInProgress: true })}
      </>,
    );

    screen.getByRole("button", { name: "Other control" }).focus();
    expect(screen.getByRole("button", { name: "Other control" })).toHaveFocus();

    rerender(
      <>
        <button type="button">Other control</button>
        {windowElement({ isAssistantTurnInProgress: false })}
      </>,
    );

    expect(
      screen.getByRole("textbox", { name: "Message the assistant" }),
    ).toHaveFocus();
  });
});
