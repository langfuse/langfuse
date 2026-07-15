import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import { InAppAgentWindow } from "./InAppAgentWindow";

const capture = vi.fn();

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => capture,
}));

describe("InAppAgentWindow quick actions", () => {
  it("switches areas and submits the action prompt with stable attribution", async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    Element.prototype.scrollTo = vi.fn();

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
    expect(
      screen.getByRole("radio", { name: "Your Project" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Dashboards" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Observability" })).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: "Prompts" }));
    expect(screen.getByRole("radio", { name: "Prompts" })).toBeChecked();

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

    expect(screen.getByRole("radio", { name: "Observability" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "Prompts" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Improve this prompt" }),
    );

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "Review the prompt currently in view and suggest concrete improvements to its structure, instructions, and variables while preserving its intent.",
        {
          quickAction: {
            actionId: "improve-prompt",
            context: "prompts",
          },
        },
      );
    });
    expect(capture).toHaveBeenCalledWith("in_app_agent:quick_action_started", {
      actionId: "improve-prompt",
      quickActionContext: "prompts",
      position: 0,
    });
  });
});
