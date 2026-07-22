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
    private pendingRuns: Array<{
      resolve: () => void;
      reject: (error: unknown) => void;
    }> = [];

    constructor(options: { threadId: string; initialMessages?: unknown[] }) {
      this.threadId = options.threadId;
      this.messages = [...(options.initialMessages ?? [])];
      this.runAgent.mockImplementation(() => {
        this.isRunning = true;
        return new Promise<void>((resolve, reject) => {
          this.pendingRuns.push({
            resolve: () => {
              this.isRunning = false;
              resolve();
            },
            reject: (error) => {
              this.isRunning = false;
              reject(error);
            },
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
      const run = this.pendingRuns.shift();
      if (!run) {
        throw new Error("No run to finish");
      }
      run.resolve();
    }

    failNextRun(error: unknown) {
      const run = this.pendingRuns.shift();
      if (!run) {
        throw new Error("No run to fail");
      }
      run.reject(error);
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

vi.mock("./InAppAgentDisabledDialog", () => ({
  InAppAgentDisabledDialog: () => null,
}));

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
      {["first", "second", "third", "fourth"].map((content) => (
        <button key={content} onClick={() => agent.submit(content)}>
          Submit {content}
        </button>
      ))}
      <button
        onClick={() => {
          agent.setTranscriptAnimating(true);
        }}
      >
        Start animation
      </button>
      <button
        onClick={() => {
          agent.setTranscriptAnimating(false);
        }}
      >
        Finish animation
      </button>
      <button onClick={() => agent.approveToolCall("approval-1")}>
        Approve
      </button>
      {agent.queuedMessages.map((message) => (
        <div key={message.id}>
          <span>{message.content}</span>
          <button
            aria-label={`Edit ${message.content}`}
            onClick={() => {
              agent.editQueuedMessage(message.id, "edited");
            }}
          >
            Edit
          </button>
          <button
            aria-label={`Delete ${message.content}`}
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

describe("InAppAiAgentProvider follow-up queue", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.agents.length = 0;
    mocks.capture.mockClear();
  });

  it("waits for transcript settlement and approval continuation before dispatching FIFO", async () => {
    renderProvider();

    fireEvent.click(screen.getByText("Submit first"));
    await waitFor(() => {
      expect(mocks.agents).toHaveLength(1);
    });
    const agent = mocks.agents[0];
    if (!agent) {
      throw new Error("Expected an agent");
    }

    fireEvent.click(screen.getByText("Start animation"));
    fireEvent.click(screen.getByText("Submit second"));
    fireEvent.click(screen.getByText("Submit third"));
    act(() => {
      agent.requestApproval();
    });
    await act(async () => {
      agent.finishNextRun();
    });

    fireEvent.click(screen.getByText("Finish animation"));
    expect(agent.runAgent).toHaveBeenCalledOnce();
    expect(agent.userMessages).toEqual(["first"]);

    fireEvent.click(screen.getByText("Approve"));
    await waitFor(() => {
      expect(agent.runAgent).toHaveBeenCalledTimes(2);
    });
    fireEvent.click(screen.getByText("Start animation"));
    await act(async () => {
      agent.finishNextRun();
    });
    fireEvent.click(screen.getByText("Finish animation"));

    await waitFor(() => {
      expect(agent.userMessages).toEqual(["first", "second"]);
    });
    expect(agent.runAgent).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByText("Start animation"));
    await act(async () => {
      agent.finishNextRun();
    });
    fireEvent.click(screen.getByText("Finish animation"));

    await waitFor(() => {
      expect(agent.userMessages).toEqual(["first", "second", "third"]);
    });
    expect(mocks.capture).toHaveBeenCalledWith("in_app_agent:message_queued", {
      queueDepth: 1,
    });
  });

  it("edits and deletes pending messages and retries a rate-limited dispatch without duplication", async () => {
    renderProvider();

    fireEvent.click(screen.getByText("Submit first"));
    await waitFor(() => {
      expect(mocks.agents).toHaveLength(1);
    });
    const agent = mocks.agents[0];
    if (!agent) {
      throw new Error("Expected an agent");
    }

    fireEvent.click(screen.getByText("Submit second"));
    fireEvent.click(screen.getByText("Submit third"));
    fireEvent.click(screen.getByText("Submit fourth"));
    fireEvent.click(screen.getByRole("button", { name: "Edit third" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete second" }));

    await act(async () => {
      agent.finishNextRun();
    });
    await waitFor(() => {
      expect(agent.userMessages).toEqual(["first", "edited"]);
    });

    await act(async () => {
      agent.failNextRun({
        payload: {
          code: "rate_limited",
          details: { retryAfterSeconds: 1 },
        },
      });
    });
    await waitFor(
      () => {
        expect(agent.runAgent).toHaveBeenCalledTimes(3);
      },
      {
        timeout: 2_000,
      },
    );
    expect(agent.userMessages).toEqual(["first", "edited"]);

    await act(async () => {
      agent.finishNextRun();
    });
    await waitFor(() => {
      expect(agent.userMessages).toEqual(["first", "edited", "fourth"]);
    });
  });
});
