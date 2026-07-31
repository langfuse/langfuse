import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { HttpAgent, type AgentSubscriber } from "@ag-ui/client";
import { InAppAgentRunStatus } from "@langfuse/shared";
import type { AgUiMessage } from "@langfuse/shared/in-app-agent";

import { TooltipProvider } from "@/src/components/ui/tooltip";
import { ControlledInAppAgentWindow } from "./ControlledInAppAgentWindow";
import { InAppAiAgentProvider } from "./InAppAiAgentProvider";

const providerMocks = vi.hoisted(() => ({
  backgroundExecutionEnabled: false,
  capture: vi.fn(),
  startRun: vi.fn(),
  cancelRun: vi.fn(),
  decideToolApproval: vi.fn(),
  getConversation: vi.fn(),
  listQuery: {
    data: { pages: [{ conversations: [] }] },
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  },
  conversationQuery: {
    data: undefined as
      | undefined
      | {
          conversation: { id: string; isWriteLocked: boolean };
          messages: AgUiMessage[];
          eventCursor: number;
          latestRun: {
            id: string;
            status: InAppAgentRunStatus;
            errorCode: string | null;
            cancelRequested: boolean;
          } | null;
          displayState?: unknown;
          pendingToolApprovals: Array<{
            runId: string;
            approvalRequest: {
              type: "tool_approval_request";
              toolCallId: string;
              toolName: string;
              runId: string;
            };
          }>;
        },
    error: null,
    isLoading: false,
  },
  utils: {
    inAppAgent: {
      getConversation: {
        fetch: vi.fn(),
        invalidate: vi.fn(),
      },
      listConversations: {
        invalidate: vi.fn(),
      },
    },
  },
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    asPath: "/project/project-1/traces",
    query: { projectId: "project-1" },
  }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { name: "Test User" } } }),
}));

vi.mock("@/src/features/entitlements/hooks", () => ({
  useHasEntitlement: () => true,
}));

vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProjectOrOrganization: () => ({
    organization: { aiFeaturesEnabled: true },
  }),
}));

vi.mock("@/src/features/in-app-agent/lib/backgroundExecutionFlag", () => ({
  useInAppAgentBackgroundExecutionEnabled: () =>
    providerMocks.backgroundExecutionEnabled,
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => providerMocks.capture,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => providerMocks.utils,
    inAppAgent: {
      listConversations: {
        useInfiniteQuery: () => providerMocks.listQuery,
      },
      getConversation: {
        useQuery: () => providerMocks.conversationQuery,
      },
      deleteConversation: {
        useMutation: () => ({ mutateAsync: vi.fn() }),
      },
      submitFeedback: {
        useMutation: () => ({ mutateAsync: vi.fn() }),
      },
      startRun: {
        useMutation: () => ({ mutateAsync: providerMocks.startRun }),
      },
      cancelRun: {
        useMutation: () => ({
          isPending: false,
          mutateAsync: providerMocks.cancelRun,
        }),
      },
      decideToolApproval: {
        useMutation: () => ({
          mutateAsync: providerMocks.decideToolApproval,
        }),
      },
    },
  },
}));

Element.prototype.scrollTo = vi.fn();

function renderExecutionUi() {
  return render(
    <TooltipProvider>
      <InAppAiAgentProvider defaultOpen>
        <ControlledInAppAgentWindow
          isExpanded={false}
          onDeleteConversation={vi.fn()}
          onExpandedChange={vi.fn()}
          showCloseButton={false}
        />
      </InAppAiAgentProvider>
    </TooltipProvider>,
  );
}

describe("in-app agent execution", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    providerMocks.backgroundExecutionEnabled = false;
    providerMocks.conversationQuery.data = undefined;
    window.sessionStorage.clear();
  });

  it("keeps foreground submission and approval working when background execution is disabled", async () => {
    let subscriber: AgentSubscriber | undefined;
    const runAgent = vi
      .spyOn(HttpAgent.prototype, "runAgent")
      .mockResolvedValue({ result: undefined, newMessages: [] });
    const abortRun = vi.spyOn(HttpAgent.prototype, "abortRun");
    vi.spyOn(HttpAgent.prototype, "subscribe").mockImplementation(
      (nextSubscriber: AgentSubscriber) => {
        subscriber = nextSubscriber;
        return { unsubscribe: vi.fn() };
      },
    );

    const { unmount } = renderExecutionUi();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /stop run/i }),
    ).not.toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("textbox", { name: "Message the assistant" }),
      { target: { value: "Investigate this project" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(runAgent).toHaveBeenCalledOnce();
    });
    expect(providerMocks.startRun).not.toHaveBeenCalled();

    await act(async () => {
      await subscriber?.onCustomEvent?.({
        event: {
          name: "on_interrupt",
          value: {
            type: "mastra_suspend",
            toolCallId: "tool-call-1",
            toolName: "dangerousTool",
            runId: "run-1",
          },
        },
      } as never);
    });

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Confirm",
      }),
    );
    await waitFor(() => {
      expect(runAgent).toHaveBeenCalledTimes(2);
    });

    unmount();
    expect(abortRun).toHaveBeenCalled();
  });

  it("renders persisted background messages and approval actions in the drawer", async () => {
    providerMocks.backgroundExecutionEnabled = true;
    providerMocks.conversationQuery.data = {
      conversation: {
        id: "conversation-1",
        isWriteLocked: false,
      },
      messages: [
        {
          id: "persisted-user",
          role: "user",
          content: "Create the prompt",
        },
        {
          id: "persisted-assistant",
          role: "assistant",
          content: "I need approval.",
        },
      ],
      eventCursor: 12,
      latestRun: {
        id: "run-1",
        status: InAppAgentRunStatus.AWAITING_APPROVAL,
        errorCode: null,
        cancelRequested: false,
      },
      pendingToolApprovals: [
        {
          runId: "run-1",
          approvalRequest: {
            type: "tool_approval_request",
            toolCallId: "tool-call-1",
            toolName: "langfuse_createTextPrompt",
            runId: "run-1",
          },
        },
      ],
    };
    window.sessionStorage.setItem(
      "langfuse:in-app-ai-agent-selected-conversation:project-1",
      JSON.stringify("conversation-1"),
    );

    renderExecutionUi();

    expect(await screen.findByText("Create the prompt")).toBeInTheDocument();
    expect(screen.getByText("I need approval.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Confirm",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Reject",
      }),
    ).toBeInTheDocument();
  });
});
