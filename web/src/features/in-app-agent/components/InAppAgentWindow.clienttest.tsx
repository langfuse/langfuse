import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { ScanSearch } from "lucide-react";
import { InAppAgentRunStatus } from "@langfuse/shared";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import {
  InAppAgentWindow,
  type InAppAgentWindowProps,
} from "./InAppAgentWindow";
import { ControlledInAppAgentWindow } from "./ControlledInAppAgentWindow";

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
    execution: { type: "foreground" } as
      | { type: "foreground" }
      | {
          type: "background";
          run: {
            id: string;
            status: InAppAgentRunStatus;
            errorCode: string | null;
            cancelRequested: boolean;
          } | null;
          isCancelling: boolean;
          cancel: () => void;
        },
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

const finishAnimation = vi.fn();

vi.mock("./useSmoothStreamingMessages", () => ({
  useSmoothStreamingMessages: () => ({
    finishAnimation,
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
    executionUi: { type: "foreground" },
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

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /stop run/i }),
    ).not.toBeInTheDocument();
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

describe("ControlledInAppAgentWindow stop", () => {
  it("flushes the paced reveal and cancels the run from one Stop click", () => {
    const cancel = vi.fn();
    controlledAgent.value.isRunning = true;
    controlledAgent.value.pendingToolApprovals = [];
    controlledAgent.value.execution = {
      type: "background",
      run: {
        id: "run-1",
        status: InAppAgentRunStatus.RUNNING,
        errorCode: null,
        cancelRequested: false,
      },
      isCancelling: false,
      cancel,
    };

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

    fireEvent.click(screen.getByRole("button", { name: "Stop run" }));

    // Cancelling alone only stops future frames. Without the flush the already
    // buffered block keeps typing out, which reads as "stop did nothing".
    expect(cancel).toHaveBeenCalledOnce();
    expect(finishAnimation).toHaveBeenCalledOnce();
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

describe("InAppAgentWindow scrolling", () => {
  it("detaches auto-follow and uses the Latest control to reattach", () => {
    const messages = [
      {
        id: "user-1",
        role: "user" as const,
        content: { type: "text" as const, text: "Investigate latency" },
      },
      {
        id: "assistant-1",
        role: "assistant" as const,
        content: { type: "text" as const, text: "First finding" },
      },
    ];
    const { container, rerender } = render(windowElement({ messages }));
    const viewport =
      container.querySelector<HTMLDivElement>(".overflow-y-auto");
    if (!viewport) {
      throw new Error("Expected the assistant message viewport");
    }

    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 1_000 },
      scrollTop: { configurable: true, value: 800, writable: true },
    });
    fireEvent.scroll(viewport);
    viewport.scrollTop = 500;
    fireEvent.scroll(viewport);

    expect(
      screen.getByRole("button", { name: "Scroll to latest message" }),
    ).toBeInTheDocument();
    vi.mocked(Element.prototype.scrollTo).mockClear();

    rerender(
      windowElement({
        messages: messages.concat({
          id: "assistant-2",
          role: "assistant",
          content: { type: "text", text: "Streamed finding" },
        }),
      }),
    );
    expect(Element.prototype.scrollTo).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Scroll to latest message" }),
    );
    expect(Element.prototype.scrollTo).toHaveBeenCalledWith({
      top: 1_000,
      behavior: "smooth",
    });
    expect(
      screen.queryByRole("button", { name: "Scroll to latest message" }),
    ).not.toBeInTheDocument();
  });
});

describe("InAppAgentWindow message actions", () => {
  it("shows actions only for the final answer and copies that text block", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.stubGlobal("ClipboardItem", undefined);

    const activityMessages = [
      {
        id: "user-1",
        role: "user" as const,
        content: { type: "text" as const, text: "Investigate latency" },
      },
      {
        id: "assistant-intro",
        timestamp: new Date("2026-08-06T15:26:26.000Z").getTime(),
        role: "assistant" as const,
        content: {
          type: "text" as const,
          text: "I will inspect the slow traces.",
        },
      },
      {
        id: "assistant-reasoning",
        role: "assistant" as const,
        content: {
          type: "reasoning" as const,
          text: "This private reasoning is not part of the answer.",
          isStreaming: false,
        },
      },
      {
        id: "assistant-tool",
        role: "assistant" as const,
        content: { type: "toolGroup" as const, tools: [] },
      },
    ];
    const finalAnswer = {
      id: "assistant-conclusion",
      runId: "run-1",
      timestamp: new Date("2026-08-06T15:27:17.000Z").getTime(),
      role: "assistant" as const,
      content: {
        type: "text" as const,
        text: "The reranker is the bottleneck.",
      },
    };

    const { rerender } = render(
      windowElement({
        isAssistantTurnInProgress: true,
        messages: activityMessages,
      }),
    );

    const workingTrigger = screen.getByRole("button", { name: "Working…" });
    expect(workingTrigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("I will inspect the slow traces.")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Copy message" }),
    ).not.toBeInTheDocument();

    rerender(windowElement({ messages: activityMessages.concat(finalAnswer) }));

    const activityTrigger = screen.getByRole("button", {
      name: "Worked for 51s",
    });
    expect(activityTrigger).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByText("I will inspect the slow traces."),
    ).not.toBeInTheDocument();
    expect(screen.getByText("The reranker is the bottleneck.")).toBeVisible();

    fireEvent.click(activityTrigger);
    expect(activityTrigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("I will inspect the slow traces.")).toBeVisible();

    const actionRows = screen.getAllByTestId("in-app-agent-message-actions");
    expect(actionRows).toHaveLength(1);
    expect(
      screen.getAllByRole("button", { name: "Copy message" }),
    ).toHaveLength(1);
    expect(
      within(actionRows[0]).getByRole("button", { name: "Good response" }),
    ).toBeInTheDocument();
    expect(
      within(actionRows[0]).getByRole("button", { name: "Bad response" }),
    ).toBeInTheDocument();
    expect(actionRows[0].querySelector("time")).toHaveClass("opacity-0");

    fireEvent.click(
      within(actionRows[0]).getByRole("button", {
        name: "Copy message",
      }),
    );

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("The reranker is the bottleneck.");
    });
  });
});
