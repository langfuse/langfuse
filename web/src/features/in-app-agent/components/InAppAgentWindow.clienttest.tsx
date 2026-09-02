import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { ScanSearch } from "lucide-react";
import { InAppAgentRunStatus } from "@langfuse/shared/in-app-agent";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import {
  InAppAgentWindow,
  type InAppAgentWindowProps,
} from "./InAppAgentWindow";
import { ControlledInAppAgentWindow } from "./ControlledInAppAgentWindow";
import type { InAppAgentError } from "./utils/utils";
import { resizeComposerTextarea } from "@/src/features/in-app-agent/lib/resizeComposerTextarea";

const capture = vi.fn();
const controlledAgent = vi.hoisted(() => ({
  value: {
    conversations: [] as Array<{ id: string; title: string | null }>,
    activityByConversationId: new Map<string, { state: string }>(),
    attentionCount: 0,
    dock: "sidebar" as const,
    setDock: vi.fn(),
    error: null as InAppAgentError | null,
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
    selectedConversationTitle: null,
    selectConversation: vi.fn(),
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
    dock: "sidebar",
    onDockChange: vi.fn(),
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
    screenContextDescription: { type: "trace-list" },
    selectedConversationId: undefined,
    selectedConversationTitle: null,
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
  it("switches tabs, resets on route change, and submits the action prompt with analytics", async () => {
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
        undefined,
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

describe("InAppAgentWindow header", () => {
  it("titles the window by the conversation, and falls back to the product name", () => {
    const { rerender } = render(
      windowElement({
        selectedConversationId: "conversation-1",
        selectedConversationTitle: "  Latency outliers  ",
      }),
    );

    expect(screen.getByText("Latency outliers")).toBeInTheDocument();

    // An unnamed conversation falls back to the product name.
    rerender(
      windowElement({
        selectedConversationId: "conversation-1",
        selectedConversationTitle: null,
      }),
    );

    expect(screen.getByText("Assistant")).toBeInTheDocument();
  });

  it("detaches from the sidebar and docks back from the overlay", () => {
    capture.mockClear();
    const onDockChange = vi.fn();
    const { rerender } = render(
      windowElement({ dock: "sidebar", onDockChange }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Detach assistant" }));
    expect(onDockChange).toHaveBeenCalledWith("detached");
    expect(capture).toHaveBeenCalledWith("in_app_agent:presentation_changed", {
      presentation: "detached",
    });

    rerender(windowElement({ dock: "detached", onDockChange }));
    fireEvent.click(screen.getByRole("button", { name: "Dock assistant" }));
    expect(onDockChange).toHaveBeenCalledWith("sidebar");
    expect(capture).toHaveBeenCalledWith("in_app_agent:presentation_changed", {
      presentation: "sidebar",
    });
  });

  it("hides detach and dock while expanded", () => {
    render(windowElement({ dock: "sidebar", isExpanded: true }));

    expect(
      screen.queryByRole("button", { name: "Detach assistant" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Dock assistant" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Collapse window" }),
    ).toBeInTheDocument();
  });

  it("hides detach and dock when dock changes are not wired", () => {
    render(windowElement({ onDockChange: undefined }));

    expect(
      screen.queryByRole("button", { name: "Detach assistant" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Dock assistant" }),
    ).not.toBeInTheDocument();
  });

  it("toggles expanded on a header double-click, but not from its actions", () => {
    const onExpandedChange = vi.fn();
    render(windowElement({ onExpandedChange }));

    fireEvent.dblClick(screen.getByRole("banner"));
    expect(onExpandedChange).toHaveBeenCalledWith(true);

    fireEvent.dblClick(
      screen.getByRole("button", { name: "Start new conversation" }),
    );
    expect(onExpandedChange).toHaveBeenCalledTimes(1);
  });
});

describe("ControlledInAppAgentWindow composer", () => {
  beforeEach(() => {
    controlledAgent.value.error = null;
    controlledAgent.value.isRunning = true;
    controlledAgent.value.isSelectedConversationHydrating = false;
    controlledAgent.value.isSubmitting = false;
    controlledAgent.value.pendingToolApprovals = [];
    controlledAgent.value.selectConversation = vi.fn();
    controlledAgent.value.execution = {
      run: null,
      isCancelling: false,
      cancel: vi.fn(),
    };
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

describe("InAppAgentWindow activity", () => {
  it("shows a waiting drawer, then Working once the first activity arrives", () => {
    const userMessage = {
      id: "user-1",
      role: "user" as const,
      content: { type: "text" as const, text: "Summarize recent errors." },
    };
    const { rerender } = render(
      windowElement({
        isAssistantTurnInProgress: true,
        messages: [
          userMessage,
          {
            id: "connecting",
            role: "assistant",
            content: { type: "loading", label: "Connecting..." },
          },
        ],
      }),
    );

    const waitingTrigger = screen.getByRole("button", {
      name: "There for you in a second…",
    });
    expect(waitingTrigger).toBeVisible();
    expect(waitingTrigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Connecting...")).not.toBeInTheDocument();
    expect(screen.queryByText("Thinking...")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("status", { name: "Working…" }),
    ).not.toBeInTheDocument();

    fireEvent.click(waitingTrigger);
    expect(waitingTrigger).toHaveAttribute("aria-expanded", "true");

    const reasoning = {
      id: "assistant-reasoning",
      timestamp: new Date("2026-08-06T15:26:26.000Z").getTime(),
      role: "assistant" as const,
      content: {
        type: "reasoning" as const,
        text: "I will inspect the recent errors.",
        isStreaming: false,
      },
    };

    rerender(
      windowElement({
        isAssistantTurnInProgress: true,
        messages: [userMessage, reasoning],
      }),
    );

    const workingTrigger = screen.getByRole("button", { name: "Working…" });
    expect(workingTrigger).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "There for you in a second…" }),
    ).not.toBeInTheDocument();
    // The drawer the user opened while waiting is the same drawer now working.
    expect(workingTrigger).toHaveAttribute("aria-expanded", "true");

    rerender(
      windowElement({
        messages: [
          userMessage,
          reasoning,
          {
            id: "assistant-answer",
            runId: "run-1",
            timestamp: new Date("2026-08-06T15:27:17.000Z").getTime(),
            role: "assistant",
            content: { type: "text", text: "Two ingestion retries failed." },
          },
        ],
      }),
    );

    // Settling must not tear the drawer down and collapse it under the user.
    expect(
      screen.getByRole("button", { name: "Worked for 51s" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("labels a completed turn with compact minutes and leftover seconds", () => {
    render(
      windowElement({
        messages: [
          {
            id: "user-1",
            role: "user",
            content: { type: "text", text: "Investigate latency" },
          },
          {
            id: "assistant-reasoning",
            timestamp: new Date("2026-08-06T15:26:26.000Z").getTime(),
            role: "assistant",
            content: {
              type: "reasoning",
              text: "Checking the slow traces.",
              isStreaming: false,
            },
          },
          {
            id: "assistant-conclusion",
            runId: "run-1",
            timestamp: new Date("2026-08-06T15:29:55.000Z").getTime(),
            role: "assistant",
            content: { type: "text", text: "The reranker is the bottleneck." },
          },
        ],
      }),
    );

    expect(
      screen.getByRole("button", { name: "Worked for 3m 29s" }),
    ).toBeVisible();
  });

  it("keeps the activity drawer collapsed and shows technical names when opened", () => {
    render(
      windowElement({
        isAssistantTurnInProgress: true,
        messages: [
          {
            id: "user-1",
            role: "user",
            content: { type: "text", text: "Why did latency increase?" },
          },
          {
            id: "assistant-reasoning",
            role: "assistant",
            content: {
              type: "reasoning",
              text: "The slowest traces share a reranking step.",
              isStreaming: false,
            },
          },
          {
            id: "assistant-tool-1",
            role: "assistant",
            content: {
              type: "toolGroup",
              tools: [
                {
                  type: "tool",
                  name: "langfuse_getObservation",
                  status: "succeeded",
                  args: "{}",
                },
              ],
            },
          },
          {
            id: "assistant-reasoning-2",
            role: "assistant",
            content: {
              type: "reasoning",
              text: "The reranking step is slow across both outlier traces.",
              isStreaming: false,
            },
          },
          {
            id: "assistant-tool-2",
            role: "assistant",
            content: {
              type: "toolGroup",
              tools: [
                {
                  type: "tool",
                  name: "langfuse_listObservations",
                  status: "running",
                  args: "{}",
                },
              ],
            },
          },
        ],
      }),
    );

    const headline = screen.getByRole("button", {
      name: "Looking at observations",
    });
    expect(headline).toBeVisible();
    expect(headline).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Thought")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "The reranking step is slow across both outlier traces.",
      ),
    ).not.toBeInTheDocument();

    fireEvent.click(headline);
    expect(headline).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText("Thought")).toHaveLength(2);
    expect(screen.getByLabelText("getObservation: succeeded")).toBeVisible();
    expect(screen.getByLabelText("listObservations: running")).toBeVisible();
    expect(screen.queryByText("Calling 1 tool")).not.toBeInTheDocument();
  });
});

describe("InAppAgentWindow composer", () => {
  it("does not lock the composer to the height cap before the field has a width", () => {
    const textarea = document.createElement("textarea");
    textarea.style.height = "36px";
    vi.spyOn(textarea, "getBoundingClientRect").mockReturnValue({
      width: 0,
      height: 36,
      top: 0,
      left: 0,
      bottom: 36,
      right: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    Object.defineProperty(textarea, "scrollHeight", { value: 480 });

    resizeComposerTextarea(textarea);

    expect(textarea.style.height).toBe("36px");
  });

  it("uses Reply after an assistant answer and the welcome copy on a fresh conversation", () => {
    const { rerender } = render(windowElement());

    expect(
      screen.getByRole("textbox", { name: "Message the assistant" }),
    ).toHaveAttribute("placeholder", "Let me know what I can do for you...");

    rerender(
      windowElement({
        messages: [
          {
            id: "user-1",
            role: "user",
            content: { type: "text", text: "What failed overnight?" },
          },
          {
            id: "assistant-1",
            role: "assistant",
            content: {
              type: "text",
              text: "Ingestion errors spiked after 2am.",
            },
          },
        ],
      }),
    );

    expect(
      screen.getByRole("textbox", { name: "Message the assistant" }),
    ).toHaveAttribute("placeholder", "Reply...");
  });

  it("does not settle mid-turn assistant text while the run is still working", () => {
    render(
      windowElement({
        isAssistantTurnInProgress: true,
        messages: [
          {
            id: "user-1",
            role: "user",
            content: { type: "text", text: "Cluster the failed traces." },
          },
          {
            id: "assistant-tool",
            role: "assistant",
            content: {
              type: "toolGroup",
              tools: [
                {
                  type: "tool",
                  name: "langfuse_listObservations",
                  status: "succeeded",
                  args: "{}",
                },
              ],
            },
          },
          {
            id: "assistant-mid-turn",
            role: "assistant",
            content: {
              type: "text",
              text: "Let me confirm by inspecting a couple of payloads.",
            },
          },
        ],
      }),
    );

    expect(
      screen.queryByText("Let me confirm by inspecting a couple of payloads."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Copy message" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Good response" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Message the assistant" }),
    ).toHaveAttribute("placeholder", "Let me know what I can do for you...");

    fireEvent.click(
      screen.getByRole("button", { name: "Browsing observations" }),
    );
    expect(
      screen.getByText("Let me confirm by inspecting a couple of payloads."),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Copy message" }),
    ).not.toBeInTheDocument();
  });

  it("keeps a finished answer visible while the transcript is still revealing", () => {
    render(
      windowElement({
        isAssistantTurnInProgress: true,
        isRunUnsettled: false,
        messages: [
          {
            id: "user-1",
            role: "user",
            content: { type: "text", text: "What changed?" },
          },
          {
            id: "assistant-tool",
            role: "assistant",
            content: {
              type: "toolGroup",
              tools: [
                {
                  type: "tool",
                  name: "langfuse_listObservations",
                  status: "succeeded",
                  args: "{}",
                  result: "{}",
                },
              ],
            },
          },
          {
            id: "assistant-answer",
            role: "assistant",
            content: {
              type: "text",
              text: "Observation volume stayed flat.",
            },
          },
        ],
      }),
    );

    expect(screen.getByText("Observation volume stayed flat.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Copy message" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Message the assistant" }),
    ).toHaveAttribute("placeholder", "Reply...");
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
      timestamp: new Date("2026-08-06T15:27:17.204Z").getTime(),
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
    expect(workingTrigger).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByText("I will inspect the slow traces."),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Current trace view in context")).toBeVisible();
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

  it("joins later answer texts into one visible reply after Working", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.stubGlobal("ClipboardItem", undefined);

    const analysis = "The traces are synthetic seed data, not real traffic.";
    const closer = "I've prepared a link to the error-level traces.";

    render(
      windowElement({
        messages: [
          {
            id: "user-1",
            role: "user" as const,
            content: {
              type: "text" as const,
              text: "What is going on with errors?",
            },
          },
          {
            id: "assistant-reasoning",
            timestamp: new Date("2026-08-06T15:26:26.000Z").getTime(),
            role: "assistant" as const,
            content: {
              type: "reasoning" as const,
              text: "I should inspect the error traces first.",
              isStreaming: false,
            },
          },
          {
            id: "assistant-tool",
            role: "assistant" as const,
            content: { type: "toolGroup" as const, tools: [] },
          },
          {
            id: "assistant-analysis",
            timestamp: new Date("2026-08-06T15:27:20.000Z").getTime(),
            role: "assistant" as const,
            content: {
              type: "text" as const,
              text: analysis,
              redirectAction: {
                type: "redirectAction" as const,
                label: "Open error traces",
                href: "/project/project-1/traces?level=ERROR",
              },
            },
          },
          {
            id: "assistant-closer",
            runId: "run-1",
            timestamp: new Date("2026-08-06T15:27:48.000Z").getTime(),
            role: "assistant" as const,
            content: {
              type: "text" as const,
              text: closer,
            },
          },
        ],
      }),
    );

    const activityTrigger = screen.getByRole("button", {
      name: /Worked for/,
    });
    expect(activityTrigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(analysis)).toBeVisible();
    expect(screen.getByText(closer)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Open error traces" }),
    ).toBeVisible();
    expect(
      screen.queryByText("I should inspect the error traces first."),
    ).not.toBeInTheDocument();

    fireEvent.click(activityTrigger);
    expect(screen.getByText("Thought")).toBeVisible();
    expect(screen.getByText(analysis)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(`${analysis}\n\n${closer}`);
    });
  });
});
