import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type * as AgUiClient from "@ag-ui/client";

import { InAppAiAgentProvider, useInAppAiAgent } from "./InAppAiAgentProvider";

const mocks = vi.hoisted(() => {
  type Subscriber = {
    onCustomEvent?: (payload: { event: unknown }) => void;
    onMessagesChanged?: (payload: { messages: unknown[] }) => void;
  };
  class MockHttpAgent {
    readonly threadId: string;
    messages: unknown[];
    isRunning = false;
    readonly abortRun = vi.fn();
    readonly runAgent = vi.fn();
    private subscriber: Subscriber | undefined;
    private pendingRuns: Array<() => void> = [];

    constructor(options: { threadId: string; initialMessages?: unknown[] }) {
      this.threadId = options.threadId;
      this.messages = [...(options.initialMessages ?? [])];
      this.runAgent.mockImplementation(() => {
        this.isRunning = true;
        return new Promise<void>((resolve) => {
          this.pendingRuns.push(() => {
            this.isRunning = false;
            resolve();
          });
        });
      });
      agents.push(this);
    }

    addMessage(message: unknown) {
      this.messages.push(message);
      this.subscriber?.onMessagesChanged?.({ messages: this.messages });
    }

    subscribe(subscriber: Subscriber) {
      this.subscriber = subscriber;
      return { unsubscribe: vi.fn() };
    }

    finishNextRun() {
      const finish = this.pendingRuns.shift();
      if (!finish) {
        throw new Error("No run to finish");
      }
      finish();
    }

    requestApproval() {
      this.subscriber?.onCustomEvent?.({
        event: {
          name: "on_interrupt",
          value: {
            type: "mastra_suspend",
            toolCallId: "approval-1",
            toolName: "createDashboardWidget",
            runId: "run-1",
          },
        },
      });
    }

    get userMessages() {
      return this.messages
        .filter(
          (message): message is { role: string; content: string } =>
            typeof message === "object" &&
            message !== null &&
            "role" in message &&
            message.role === "user" &&
            "content" in message &&
            typeof message.content === "string",
        )
        .map((message) => message.content);
    }
  }

  const agents: MockHttpAgent[] = [];
  return { agents, capture: vi.fn(), MockHttpAgent };
});

vi.mock("@ag-ui/client", async (importOriginal) => {
  const actual = await importOriginal<typeof AgUiClient>();
  return { ...actual, HttpAgent: mocks.MockHttpAgent };
});

vi.mock("next/router", () => ({
  useRouter: () => ({
    asPath: "/project/project-1/traces",
    query: { projectId: "project-1" },
  }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { name: "Ada" } } }),
}));

vi.mock("@/src/features/entitlements/hooks", () => ({
  useHasEntitlement: () => true,
}));

vi.mock("@/src/features/organizations/hooks", () => ({
  useLangfuseCloudRegion: () => ({ isLangfuseCloud: true }),
}));

vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProjectOrOrganization: () => ({
    organization: { id: "org-1", aiFeaturesEnabled: true },
  }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));

vi.mock(
  "@/src/ee/features/in-app-agent/components/InAppAgentDisabledDialog",
  () => ({
    InAppAgentDisabledDialog: () => null,
  }),
);

vi.mock("@/src/utils/api", () => {
  const invalidate = vi.fn().mockResolvedValue(undefined);
  return {
    api: {
      useUtils: () => ({
        inAppAgent: {
          getConversation: { invalidate },
          listConversations: { invalidate },
        },
      }),
      inAppAgent: {
        listConversations: {
          useInfiniteQuery: () => ({
            data: { pages: [{ conversations: [] }] },
            error: null,
            fetchNextPage: vi.fn(),
            hasNextPage: false,
            isFetchingNextPage: false,
          }),
        },
        getConversation: {
          useQuery: () => ({ data: undefined, error: null, isLoading: false }),
        },
        deleteConversation: {
          useMutation: () => ({ mutateAsync: vi.fn() }),
        },
        submitFeedback: {
          useMutation: () => ({ mutateAsync: vi.fn() }),
        },
      },
    },
  };
});

function Harness() {
  const agent = useInAppAiAgent();

  return (
    <>
      <button onClick={() => agent.submit("first")}>Submit first</button>
      <button onClick={() => agent.submit("second")}>Submit second</button>
      <button onClick={() => agent.submit("third")}>Submit third</button>
      <button onClick={() => agent.submit("fourth")}>Submit fourth</button>
      <button
        onClick={() => {
          agent.selectConversation(null);
        }}
      >
        New
      </button>
      <button onClick={() => agent.approveToolCall("approval-1")}>
        Approve
      </button>
      {agent.conversations.map((conversation) => (
        <button
          key={conversation.id}
          onClick={() => {
            agent.selectConversation(conversation.id);
          }}
        >
          Open {conversation.title}
        </button>
      ))}
      {agent.queuedMessages.map((message) => (
        <div key={message.id}>
          <span>{message.content}</span>
          <button
            onClick={() => {
              agent.editQueuedMessage(message.id, "edited");
            }}
          >
            Edit
          </button>
          <button
            onClick={() => {
              agent.deleteQueuedMessage(message.id);
            }}
          >
            Delete
          </button>
        </div>
      ))}
    </>
  );
}

function renderProvider() {
  return render(
    <InAppAiAgentProvider defaultOpen>
      <Harness />
    </InAppAiAgentProvider>,
  );
}

describe("InAppAiAgentProvider concurrent conversations and queue", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.agents.length = 0;
    mocks.capture.mockClear();
  });

  it("runs separate conversations independently without aborting on switch", async () => {
    renderProvider();

    fireEvent.click(screen.getByText("Submit first"));
    await waitFor(() => {
      expect(mocks.agents).toHaveLength(1);
    });

    fireEvent.click(screen.getByText("New"));
    fireEvent.click(screen.getByText("Submit second"));
    await waitFor(() => {
      expect(mocks.agents).toHaveLength(2);
    });
    fireEvent.click(screen.getByRole("button", { name: "Open first" }));

    expect(mocks.agents[0]?.runAgent).toHaveBeenCalledOnce();
    expect(mocks.agents[1]?.runAgent).toHaveBeenCalledOnce();
    expect(mocks.agents[0]?.abortRun).not.toHaveBeenCalled();
    expect(mocks.agents[1]?.abortRun).not.toHaveBeenCalled();
  });

  it("dispatches queued follow-ups in FIFO order only after approval continuation finishes", async () => {
    renderProvider();

    fireEvent.click(screen.getByText("Submit first"));
    await waitFor(() => {
      expect(mocks.agents).toHaveLength(1);
    });
    const agent = mocks.agents[0];
    if (!agent) {
      throw new Error("Expected the first conversation agent");
    }

    fireEvent.click(screen.getByText("Submit second"));
    fireEvent.click(screen.getByText("Submit third"));
    act(() => {
      agent.requestApproval();
    });
    act(() => {
      agent.finishNextRun();
    });

    await waitFor(() => {
      expect(agent.runAgent).toHaveBeenCalledOnce();
    });
    expect(agent.userMessages).toEqual(["first"]);

    fireEvent.click(screen.getByText("Approve"));
    await waitFor(() => {
      expect(agent.runAgent).toHaveBeenCalledTimes(2);
    });
    act(() => {
      agent.finishNextRun();
    });

    await waitFor(() => {
      expect(agent.userMessages).toEqual(["first", "second"]);
    });
    expect(agent.runAgent).toHaveBeenCalledTimes(3);
    act(() => {
      agent.finishNextRun();
    });

    await waitFor(() => {
      expect(agent.userMessages).toEqual(["first", "second", "third"]);
    });
  });

  it("edits and deletes pending messages without changing FIFO order", async () => {
    renderProvider();

    fireEvent.click(screen.getByText("Submit first"));
    await waitFor(() => {
      expect(mocks.agents).toHaveLength(1);
    });
    const agent = mocks.agents[0];
    if (!agent) {
      throw new Error("Expected the first conversation agent");
    }

    fireEvent.click(screen.getByText("Submit second"));
    fireEvent.click(screen.getByText("Submit third"));
    fireEvent.click(screen.getByText("Submit fourth"));
    const editButton = (
      await screen.findAllByRole("button", { name: "Edit" })
    ).at(1);
    const deleteButton = screen
      .getAllByRole("button", { name: "Delete" })
      .at(0);
    if (!editButton || !deleteButton) {
      throw new Error("Expected queued message actions");
    }
    fireEvent.click(editButton);
    fireEvent.click(deleteButton);

    act(() => {
      agent.finishNextRun();
    });
    await waitFor(() => {
      expect(agent.userMessages).toEqual(["first", "edited"]);
    });
    act(() => {
      agent.finishNextRun();
    });
    await waitFor(() => {
      expect(agent.userMessages).toEqual(["first", "edited", "fourth"]);
    });
  });
});
