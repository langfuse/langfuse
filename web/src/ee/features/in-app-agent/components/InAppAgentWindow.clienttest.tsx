import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ScanSearch } from "lucide-react";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import {
  InAppAgentWindow,
  type InAppAgentWindowProps,
} from "./InAppAgentWindow";

const capture = vi.fn();

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => capture,
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
    isInputDisabled: false,
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

describe("InAppAgentWindow tool approvals", () => {
  const approvalToolGroupMessage = (
    tools: Array<{ id: string; status: "pending" | "approved" | "submitting" }>,
  ) =>
    ({
      id: "tools",
      role: "assistant",
      content: {
        type: "toolGroup",
        tools: tools.map(({ id, status }) => ({
          type: "tool" as const,
          name: `langfuse_createTextPrompt`,
          args: JSON.stringify({ name: id }),
          status: "running" as const,
          approval: { id, status },
        })),
      },
    }) as const;

  it("pages through approvals one card at a time and advances on decision", () => {
    const onApproveToolCall = vi.fn().mockResolvedValue(undefined);
    render(
      windowElement({
        messages: [
          approvalToolGroupMessage([
            { id: "tool-call-1", status: "pending" },
            { id: "tool-call-2", status: "pending" },
          ]),
        ],
        onApproveToolCall,
      }),
    );

    // Only the active card renders.
    expect(screen.getAllByRole("button", { name: /Confirm/ })).toHaveLength(1);
    expect(
      screen.getByText("Tool call 1 of 2 awaiting review"),
    ).toBeInTheDocument();
    expect(screen.getByText(/tool-call-1/)).toBeInTheDocument();

    // Manual navigation reaches the sibling card.
    fireEvent.click(screen.getByRole("button", { name: "Next tool call" }));
    expect(
      screen.getByText("Tool call 2 of 2 awaiting review"),
    ).toBeInTheDocument();
    expect(screen.getByText(/tool-call-2/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous tool call" }));
    expect(screen.getByText(/tool-call-1/)).toBeInTheDocument();

    // Deciding records the decision and advances to the next undecided card.
    fireEvent.click(screen.getByRole("button", { name: /Confirm/ }));
    expect(onApproveToolCall).toHaveBeenCalledWith("tool-call-1");
    expect(screen.getByText(/tool-call-2/)).toBeInTheDocument();
  });

  it("closes the pager once the batch is submitting", () => {
    render(
      windowElement({
        messages: [
          approvalToolGroupMessage([
            { id: "tool-call-1", status: "submitting" },
            { id: "tool-call-2", status: "submitting" },
          ]),
        ],
      }),
    );

    expect(
      screen.queryByRole("button", { name: /Confirm/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/awaiting review/)).not.toBeInTheDocument();
  });
});
