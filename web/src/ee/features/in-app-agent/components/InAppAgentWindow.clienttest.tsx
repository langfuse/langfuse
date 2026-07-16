import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import { InAppAgentWindow } from "./InAppAgentWindow";

const capture = vi.fn();

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => capture,
}));

// jsdom does not implement Element scrolling.
Element.prototype.scrollTo = vi.fn();

describe("InAppAgentWindow quick actions", () => {
  it("switches areas and submits the action prompt with stable attribution", async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);

    const { rerender } = render(
      <TooltipProvider>
        <InAppAgentWindow
          conversations={[]}
          error={null}
          hasMoreConversations={false}
          isAssistantTurnInProgress={false}
          isExpanded={false}
          isInputDisabled={false}
          isLoadingMoreConversations={false}
          messages={[]}
          onApproveToolCall={vi.fn()}
          onDeleteConversation={vi.fn()}
          onExpandedChange={vi.fn()}
          onLoadMoreConversations={vi.fn()}
          onNewConversation={vi.fn()}
          onOpenConversationHistory={vi.fn()}
          onRejectToolCall={vi.fn()}
          onSelectConversation={vi.fn()}
          onSubmit={onSubmit}
          onSubmitFeedback={vi.fn()}
          quickActionContext="tracing"
          quickActionResetKey="/project/project-1/traces"
          screenContextDescription={{
            type: "trace-list",
            hasAppliedFilters: true,
          }}
          selectedConversationId={undefined}
          showCloseButton={false}
        />
      </TooltipProvider>,
    );

    expect(
      screen.getByPlaceholderText("Let me know what I can do for you..."),
    ).toBeInTheDocument();
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

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Prompts" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByRole("tab", { name: "Prompts" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    rerender(
      <TooltipProvider>
        <InAppAgentWindow
          conversations={[]}
          error={null}
          hasMoreConversations={false}
          isAssistantTurnInProgress={false}
          isExpanded={false}
          isInputDisabled={false}
          isLoadingMoreConversations={false}
          messages={[]}
          onApproveToolCall={vi.fn()}
          onDeleteConversation={vi.fn()}
          onExpandedChange={vi.fn()}
          onLoadMoreConversations={vi.fn()}
          onNewConversation={vi.fn()}
          onOpenConversationHistory={vi.fn()}
          onRejectToolCall={vi.fn()}
          onSelectConversation={vi.fn()}
          onSubmit={onSubmit}
          onSubmitFeedback={vi.fn()}
          quickActionContext="tracing"
          quickActionResetKey="/project/project-1/observations"
          screenContextDescription={{
            type: "trace-list",
            hasAppliedFilters: true,
          }}
          selectedConversationId={undefined}
          showCloseButton={false}
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole("tab", { name: "Observability" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Prompts" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(
      screen.getByText("Add a new prompt to prompt management"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Create a prompt/ }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "Help me create a new prompt in Langfuse prompt management, including choosing between a text and chat prompt, defining its variables, and setting a label.",
        {
          quickAction: {
            actionId: "create-prompt",
            context: "prompts",
          },
        },
      );
    });
    expect(capture).toHaveBeenCalledWith("in_app_agent:quick_action_started", {
      actionId: "create-prompt",
      quickActionContext: "prompts",
      position: 0,
    });
  });

  it("shows focused actions on the initial area tab and falls back to coarse actions elsewhere", () => {
    render(
      <TooltipProvider>
        <InAppAgentWindow
          conversations={[]}
          error={null}
          hasMoreConversations={false}
          isAssistantTurnInProgress={false}
          isExpanded={false}
          isInputDisabled={false}
          isLoadingMoreConversations={false}
          messages={[]}
          onApproveToolCall={vi.fn()}
          onDeleteConversation={vi.fn()}
          onExpandedChange={vi.fn()}
          onLoadMoreConversations={vi.fn()}
          onNewConversation={vi.fn()}
          onOpenConversationHistory={vi.fn()}
          onRejectToolCall={vi.fn()}
          onSelectConversation={vi.fn()}
          onSubmit={vi.fn().mockResolvedValue(true)}
          onSubmitFeedback={vi.fn()}
          quickActionContext="tracing"
          focusedQuickActions={[
            {
              id: "analyze-this-trace",
              label: "Analyze this trace",
              description: "Run structured error analysis on this trace",
              prompt: "Analyze this trace.",
            },
          ]}
          quickActionResetKey="/project/project-1/traces/trace-1"
          screenContextDescription={{ type: "trace" }}
          selectedConversationId={undefined}
          showCloseButton={false}
        />
      </TooltipProvider>,
    );

    expect(
      screen.getByRole("button", { name: /^Analyze this trace/ }),
    ).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Prompts" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(
      screen.getByRole("button", { name: /^Create a prompt/ }),
    ).toBeInTheDocument();
  });
});
