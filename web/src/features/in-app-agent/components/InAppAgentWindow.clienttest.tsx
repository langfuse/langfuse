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
    conversations: [] as Array<{ id: string; title: string | null }>,
    activityByConversationId: new Map<string, { state: string }>(),
    attentionCount: 0,
    error: null,
    hasMoreConversations: false,
    isLoadingMoreConversations: false,
    isRunning: true,
    isSelectedConversationHydrating: false,
    isSubmitting: false,
    execution: {
      run: null as {
        id: string;
        status: InAppAgentRunStatus;
        errorCode: string | null;
        cancelRequested: boolean;
      } | null,
      isCancelling: false,
      cancel: vi.fn(),
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
    activityByConversationId: new Map(),
    error: null,
    executionUi: { notice: null, stop: null },
    hasMoreConversations: false,
    isAssistantTurnInProgress: false,
    isExpanded: false,
    isConversationInteractionDisabled: false,
    isSelectedConversationHydrating: false,
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

describe("InAppAgentWindow conversation history", () => {
  it("counts conversations that still owe the user a look on the history trigger", () => {
    render(
      windowElement({
        activityByConversationId: new Map([
          [
            "conversation-1",
            {
              activityKey: "run-1:SUCCEEDED",
              runId: "run-1",
              title: "Latency outliers",
              state: "done-unread",
              needsAttention: true,
            },
          ],
          [
            "conversation-2",
            {
              activityKey: "run-2:RUNNING",
              runId: "run-2",
              title: "Score correlation",
              state: "running",
              needsAttention: false,
            },
          ],
        ]),
      }),
    );

    expect(
      screen.getByRole("button", {
        name: "Conversation history (1 needs attention)",
      }),
    ).toBeInTheDocument();
  });
});

describe("ControlledInAppAgentWindow composer", () => {
  beforeEach(() => {
    controlledAgent.value.error = null;
    controlledAgent.value.isRunning = true;
    controlledAgent.value.isSelectedConversationHydrating = false;
    controlledAgent.value.isSubmitting = false;
    controlledAgent.value.pendingToolApprovals = [];
    controlledAgent.value.selectedConversationIsWriteLocked = false;
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

  it("blocks another turn here but still lets you leave", () => {
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
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /^Conversation history/ }),
    ).toBeEnabled();
  });

  it("lets you leave a read-only conversation", () => {
    controlledAgent.value.isRunning = false;
    controlledAgent.value.selectedConversationIsWriteLocked = true;

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
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Start new conversation" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /^Conversation history/ }),
    ).toBeEnabled();
  });
});

describe("ControlledInAppAgentWindow stop", () => {
  it("flushes the paced reveal and cancels the run from one Stop click", () => {
    const cancel = vi.fn();
    controlledAgent.value.isRunning = true;
    controlledAgent.value.pendingToolApprovals = [];
    controlledAgent.value.execution = {
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
  it("shows one action row per turn and copies only the assistant prose blocks", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.stubGlobal("ClipboardItem", undefined);

    render(
      windowElement({
        messages: [
          {
            id: "user-1",
            timestamp: new Date("2026-08-06T15:26:45.000Z").getTime(),
            role: "user",
            content: { type: "text", text: "Investigate latency" },
          },
          {
            id: "assistant-intro",
            role: "assistant",
            content: { type: "text", text: "I will inspect the slow traces." },
          },
          {
            id: "assistant-reasoning",
            role: "assistant",
            content: {
              type: "reasoning",
              text: "This private reasoning is not part of the answer.",
              isStreaming: false,
            },
          },
          {
            id: "assistant-tool",
            role: "assistant",
            content: { type: "toolGroup", tools: [] },
          },
          {
            id: "assistant-conclusion",
            runId: "run-1",
            timestamp: new Date("2026-08-06T15:27:17.000Z").getTime(),
            role: "assistant",
            content: { type: "text", text: "The reranker is the bottleneck." },
          },
        ],
      }),
    );

    const actionRows = screen.getAllByTestId("in-app-agent-message-actions");
    expect(actionRows).toHaveLength(2);
    expect(
      within(actionRows[0]).queryByRole("button", { name: "Good response" }),
    ).not.toBeInTheDocument();
    expect(
      within(actionRows[1]).getByRole("button", { name: "Good response" }),
    ).toBeInTheDocument();
    expect(
      within(actionRows[1]).getByRole("button", { name: "Bad response" }),
    ).toBeInTheDocument();
    expect(actionRows[0].querySelector("time")).toHaveClass("opacity-0");
    expect(actionRows[1].querySelector("time")).toHaveClass("opacity-0");

    fireEvent.click(
      within(actionRows[1]).getByRole("button", {
        name: "Copy message",
      }),
    );

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "I will inspect the slow traces.\n\nThe reranker is the bottleneck.",
      );
    });
  });
});
