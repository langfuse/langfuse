import { act, render, screen } from "@testing-library/react";
import { StrictMode } from "react";

import type { InAppAgentPendingToolApproval } from "./InAppAiAgentProvider";
import type { AgUiMessage } from "@/src/ee/features/in-app-agent/schema";
import { useSmoothStreamingMessages } from "./useSmoothStreamingMessages";

const userMessage = {
  id: "user",
  role: "user",
  content: "Investigate this",
} satisfies AgUiMessage;

const assistantMessage = (content: string) =>
  ({
    id: "assistant",
    role: "assistant",
    content,
  }) satisfies AgUiMessage;

const reasoningMessage = (content: string) =>
  ({
    id: "reasoning",
    role: "reasoning",
    content,
  }) satisfies AgUiMessage;

const assistantToolMessage = (toolCallIds: string[], isLoading: boolean) =>
  ({
    id: "assistant-tools",
    role: "assistant",
    content: "",
    isLoading,
    toolCalls: toolCallIds.map((toolCallId) => ({
      id: toolCallId,
      type: "function" as const,
      function: {
        name: `tool-${toolCallId}`,
        arguments: "{}",
      },
    })),
  }) satisfies AgUiMessage & { isLoading: boolean };

const toolResultMessage = (toolCallId: string) =>
  ({
    id: `result-${toolCallId}`,
    role: "tool",
    toolCallId,
    content: "done",
  }) satisfies AgUiMessage;

const pendingToolApproval = (
  id: string,
  status: InAppAgentPendingToolApproval["status"],
) =>
  ({
    id,
    status,
    approvalRequest: {
      type: "tool_approval_request",
      toolCallId: id,
      toolName: `tool-${id}`,
      args: {},
      runId: "run-1",
    },
  }) satisfies InAppAgentPendingToolApproval;

let prefersReducedMotion = false;
const noPendingToolApprovals: InAppAgentPendingToolApproval[] = [];

function runAllAnimationFrames() {
  while (vi.getTimerCount() > 0) {
    act(() => {
      vi.advanceTimersByTime(40);
    });
  }
}

function advanceAnimationFrames(frameCount: number) {
  for (let frame = 0; frame < frameCount; frame += 1) {
    act(() => {
      vi.advanceTimersByTime(40);
    });
  }
}

function TestConsumer({
  liveMessageVersion,
  messages,
  pendingToolApprovals = noPendingToolApprovals,
}: {
  liveMessageVersion: number;
  messages: AgUiMessage[];
  pendingToolApprovals?: InAppAgentPendingToolApproval[];
}) {
  const smoothStreaming = useSmoothStreamingMessages({
    messages,
    liveMessageVersion,
    pendingToolApprovals,
    shouldFlush: false,
  });
  const latestMessage = smoothStreaming.messages.at(-1);
  const isLoading =
    latestMessage &&
    "isLoading" in latestMessage &&
    latestMessage.isLoading === true;
  const toolCallIds = smoothStreaming.messages.flatMap((message) =>
    message.role === "assistant"
      ? (message.toolCalls?.map((toolCall) => toolCall.id) ?? [])
      : [],
  );
  const toolResultIds = smoothStreaming.messages.flatMap((message) =>
    message.role === "tool" ? [message.toolCallId] : [],
  );

  return (
    <>
      <span data-testid="content">
        {typeof latestMessage?.content === "string"
          ? latestMessage.content
          : ""}
      </span>
      <span data-testid="animating">
        {smoothStreaming.isAnimating ? "true" : "false"}
      </span>
      <span data-testid="loading">{isLoading ? "true" : "false"}</span>
      <span data-testid="message-ids">
        {smoothStreaming.messages.map((message) => message.id).join(",")}
      </span>
      {smoothStreaming.messages.map((message) =>
        typeof message.content === "string" ? (
          <span key={message.id} data-testid={`content-${message.id}`}>
            {message.content}
          </span>
        ) : null,
      )}
      <span data-testid="approval-ids">
        {smoothStreaming.pendingToolApprovals
          .map((approval) => approval.id)
          .join(",")}
      </span>
      <span data-testid="approval-statuses">
        {smoothStreaming.pendingToolApprovals
          .map((approval) => approval.status)
          .join(",")}
      </span>
      <span data-testid="running-tool-call-ids">
        {smoothStreaming.runningToolCallIds.join(",")}
      </span>
      <span data-testid="tool-call-ids">{toolCallIds.join(",")}</span>
      <span data-testid="tool-result-ids">{toolResultIds.join(",")}</span>
    </>
  );
}

describe("useSmoothStreamingMessages", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    prefersReducedMotion = false;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: prefersReducedMotion })),
    );
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps display pacing and loading state local to the transcript", () => {
    const content =
      "This coarse canonical update should be revealed smoothly by the transcript only.";
    const assistantMessage = (isLoading: boolean) =>
      ({
        id: "assistant",
        role: "assistant",
        content,
        isLoading,
      }) satisfies AgUiMessage & { isLoading: boolean };
    const { rerender } = render(
      <StrictMode>
        <TestConsumer liveMessageVersion={0} messages={[userMessage]} />
      </StrictMode>,
    );

    rerender(
      <StrictMode>
        <TestConsumer
          liveMessageVersion={1}
          messages={[userMessage, assistantMessage(true)]}
        />
      </StrictMode>,
    );

    expect(screen.getByTestId("content")).not.toHaveTextContent(content);
    expect(screen.getByTestId("animating")).toHaveTextContent("true");

    rerender(
      <StrictMode>
        <TestConsumer
          liveMessageVersion={1}
          messages={[userMessage, assistantMessage(false)]}
        />
      </StrictMode>,
    );

    expect(screen.getByTestId("loading")).toHaveTextContent("true");

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByTestId("content")).not.toHaveTextContent(content);
    expect(screen.getByTestId("animating")).toHaveTextContent("true");

    runAllAnimationFrames();

    expect(screen.getByTestId("content")).toHaveTextContent(content);
    expect(screen.getByTestId("animating")).toHaveTextContent("false");
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });

  it("does not animate hydrated history", () => {
    const content =
      "This historical assistant response is long but should appear immediately.";
    const { rerender } = render(
      <TestConsumer liveMessageVersion={0} messages={[]} />,
    );

    rerender(
      <TestConsumer
        liveMessageVersion={0}
        messages={[
          {
            id: "assistant",
            role: "assistant",
            content,
          },
        ]}
      />,
    );

    expect(screen.getByTestId("content")).toHaveTextContent(content);
    expect(screen.getByTestId("animating")).toHaveTextContent("false");
  });

  it("animates a live message that completes in one update", () => {
    const content =
      "This final response arrived atomically but should still be displayed smoothly.";
    const { rerender } = render(
      <TestConsumer liveMessageVersion={0} messages={[userMessage]} />,
    );

    rerender(
      <TestConsumer
        liveMessageVersion={1}
        messages={[
          userMessage,
          {
            id: "assistant",
            role: "assistant",
            content,
          },
        ]}
      />,
    );

    expect(screen.getByTestId("content")).not.toHaveTextContent(content);
    expect(screen.getByTestId("animating")).toHaveTextContent("true");

    runAllAnimationFrames();

    expect(screen.getByTestId("content")).toHaveTextContent(content);
    expect(screen.getByTestId("animating")).toHaveTextContent("false");
  });

  it("matches the observed generation rate for the next text chunk", () => {
    const { rerender } = render(
      <TestConsumer liveMessageVersion={0} messages={[userMessage]} />,
    );
    const emptyAssistantMessage = assistantMessage("");

    rerender(
      <TestConsumer
        liveMessageVersion={1}
        messages={[userMessage, emptyAssistantMessage]}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    const generatedContent = "x".repeat(200);
    rerender(
      <TestConsumer
        liveMessageVersion={2}
        messages={[userMessage, assistantMessage(generatedContent)]}
      />,
    );
    advanceAnimationFrames(25);

    const displayedLength =
      screen.getByTestId("content-assistant").textContent?.length ?? 0;
    expect(displayedLength).toBeGreaterThanOrEqual(75);
    expect(displayedLength).toBeLessThanOrEqual(85);
    runAllAnimationFrames();
  });

  it("keeps pacing headroom when the next chunk arrives late", () => {
    const { rerender } = render(
      <TestConsumer liveMessageVersion={0} messages={[userMessage]} />,
    );

    rerender(
      <TestConsumer
        liveMessageVersion={1}
        messages={[userMessage, assistantMessage("")]}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    const generatedContent = "x".repeat(200);
    rerender(
      <TestConsumer
        liveMessageVersion={2}
        messages={[userMessage, assistantMessage(generatedContent)]}
      />,
    );
    advanceAnimationFrames(50);

    const displayedLength =
      screen.getByTestId("content-assistant").textContent?.length ?? 0;
    expect(displayedLength).toBeGreaterThanOrEqual(155);
    expect(displayedLength).toBeLessThanOrEqual(165);
    expect(screen.getByTestId("animating")).toHaveTextContent("true");
    runAllAnimationFrames();
  });

  it("limits acceleration from one unusually fast chunk", () => {
    const { rerender } = render(
      <TestConsumer liveMessageVersion={0} messages={[userMessage]} />,
    );

    rerender(
      <TestConsumer
        liveMessageVersion={1}
        messages={[userMessage, assistantMessage("")]}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    rerender(
      <TestConsumer
        liveMessageVersion={2}
        messages={[userMessage, assistantMessage("x".repeat(100))]}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(100);
    });

    rerender(
      <TestConsumer
        liveMessageVersion={3}
        messages={[userMessage, assistantMessage("x".repeat(200))]}
      />,
    );
    const displayedBeforeFastChunk =
      screen.getByTestId("content-assistant").textContent?.length ?? 0;
    advanceAnimationFrames(25);

    const displayedAfterOneSecond =
      screen.getByTestId("content-assistant").textContent?.length ?? 0;
    expect(
      displayedAfterOneSecond - displayedBeforeFastChunk,
    ).toBeGreaterThanOrEqual(45);
    expect(
      displayedAfterOneSecond - displayedBeforeFastChunk,
    ).toBeLessThanOrEqual(51);
    runAllAnimationFrames();
  });

  it("reveals reasoning and assistant text before later tools", () => {
    const reasoningContent = "r".repeat(40);
    const assistantContent = "a".repeat(40);
    const toolMessage = {
      id: "tool-result",
      role: "tool",
      toolCallId: "tool-call",
      content: "done",
    } satisfies AgUiMessage;
    const { rerender } = render(
      <TestConsumer liveMessageVersion={0} messages={[userMessage]} />,
    );

    rerender(
      <TestConsumer
        liveMessageVersion={1}
        messages={[
          userMessage,
          reasoningMessage(reasoningContent),
          {
            id: "assistant-2",
            role: "assistant",
            content: assistantContent,
          },
          toolMessage,
        ]}
      />,
    );
    advanceAnimationFrames(30);

    expect(screen.getByTestId("content-reasoning")).toHaveTextContent(
      reasoningContent,
    );
    expect(screen.getByTestId("content-assistant-2")).not.toHaveTextContent(
      assistantContent,
    );
    expect(screen.getByTestId("message-ids")).not.toHaveTextContent(
      "tool-result",
    );
  });

  it("smooths reasoning without splitting graphemes", () => {
    const content =
      "Checking 👨‍👩‍👧‍👦 cafe\u0301 latency across the selected traces.";
    const { rerender } = render(
      <TestConsumer liveMessageVersion={0} messages={[userMessage]} />,
    );

    rerender(
      <TestConsumer
        liveMessageVersion={1}
        messages={[userMessage, reasoningMessage(content)]}
      />,
    );

    const renderedContent = [screen.getByTestId("content").textContent];
    while (vi.getTimerCount() > 0) {
      act(() => {
        vi.advanceTimersByTime(40);
      });
      renderedContent.push(screen.getByTestId("content").textContent);
    }

    expect(renderedContent).not.toContain("Checking 👨");
    expect(renderedContent).not.toContain("Checking 👨‍");
    expect(screen.getByTestId("content")).toHaveTextContent(content);
  });

  it("detects content when the agent mutates a message in place", () => {
    const reasoning = reasoningMessage("");
    const messages = [userMessage, reasoning];
    const { rerender } = render(
      <TestConsumer liveMessageVersion={0} messages={messages} />,
    );

    reasoning.content =
      "The agent mutated this reasoning object with a large chunk instead of replacing it.";
    rerender(<TestConsumer liveMessageVersion={1} messages={messages} />);

    expect(screen.getByTestId("content")).not.toHaveTextContent(
      reasoning.content,
    );

    runAllAnimationFrames();
    expect(screen.getByTestId("content")).toHaveTextContent(reasoning.content);
  });

  it("applies small chunks immediately", () => {
    const { rerender } = render(
      <TestConsumer liveMessageVersion={0} messages={[userMessage]} />,
    );

    rerender(
      <TestConsumer
        liveMessageVersion={1}
        messages={[userMessage, assistantMessage("Short")]}
      />,
    );

    expect(screen.getByTestId("content")).toHaveTextContent("Short");
    expect(screen.getByTestId("animating")).toHaveTextContent("false");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("holds structural messages behind buffered text", () => {
    const content =
      "First reveal this complete explanation before showing the tool result that follows it.";
    const toolMessage = {
      id: "tool-result",
      role: "tool",
      toolCallId: "tool-call",
      content: "done",
    } satisfies AgUiMessage;
    const { rerender } = render(
      <TestConsumer liveMessageVersion={0} messages={[userMessage]} />,
    );

    rerender(
      <TestConsumer
        liveMessageVersion={1}
        messages={[userMessage, assistantMessage(content)]}
      />,
    );
    rerender(
      <TestConsumer
        liveMessageVersion={1}
        messages={[userMessage, assistantMessage(content), toolMessage]}
      />,
    );

    expect(screen.getByTestId("message-ids")).not.toHaveTextContent(
      "tool-result",
    );

    runAllAnimationFrames();
    expect(screen.getByTestId("message-ids")).toHaveTextContent(
      "user,assistant,tool-result",
    );
  });

  it("reveals at most two tools per second", () => {
    const { rerender } = render(
      <TestConsumer liveMessageVersion={0} messages={[userMessage]} />,
    );

    rerender(
      <TestConsumer
        liveMessageVersion={1}
        messages={[
          userMessage,
          assistantToolMessage(["tool-1", "tool-2", "tool-3"], true),
        ]}
      />,
    );

    expect(screen.getByTestId("tool-call-ids")).toHaveTextContent("tool-1");
    expect(screen.getByTestId("tool-call-ids")).not.toHaveTextContent("tool-2");

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(screen.getByTestId("tool-call-ids")).not.toHaveTextContent("tool-2");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByTestId("tool-call-ids")).toHaveTextContent(
      "tool-1,tool-2",
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId("tool-call-ids")).toHaveTextContent(
      "tool-1,tool-2,tool-3",
    );
  });

  it("preserves tool pacing across loading-only updates", () => {
    const { rerender } = render(
      <TestConsumer liveMessageVersion={0} messages={[userMessage]} />,
    );
    rerender(
      <TestConsumer
        liveMessageVersion={1}
        messages={[
          userMessage,
          assistantToolMessage(["tool-1", "tool-2"], true),
        ]}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender(
      <TestConsumer
        liveMessageVersion={1}
        messages={[
          userMessage,
          assistantToolMessage(["tool-1", "tool-2"], false),
        ]}
      />,
    );

    expect(screen.getByTestId("tool-call-ids")).toHaveTextContent("tool-1");
    expect(screen.getByTestId("tool-call-ids")).not.toHaveTextContent("tool-2");
    expect(screen.getByTestId("running-tool-call-ids")).toHaveTextContent(
      "tool-1",
    );

    act(() => {
      vi.advanceTimersByTime(649);
    });
    expect(screen.getByTestId("running-tool-call-ids")).toHaveTextContent(
      "tool-1",
    );
  });

  it("keeps a completed tool running for at least 750 ms", () => {
    const { rerender } = render(
      <TestConsumer liveMessageVersion={0} messages={[userMessage]} />,
    );
    rerender(
      <TestConsumer
        liveMessageVersion={1}
        messages={[userMessage, assistantToolMessage(["tool-1"], true)]}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender(
      <TestConsumer
        liveMessageVersion={2}
        messages={[
          userMessage,
          assistantToolMessage(["tool-1"], false),
          toolResultMessage("tool-1"),
        ]}
      />,
    );

    expect(screen.getByTestId("tool-result-ids")).toBeEmptyDOMElement();
    expect(screen.getByTestId("animating")).toHaveTextContent("true");

    act(() => {
      vi.advanceTimersByTime(649);
    });
    expect(screen.getByTestId("tool-result-ids")).toBeEmptyDOMElement();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByTestId("tool-result-ids")).toHaveTextContent("tool-1");
  });

  it("paces approval appearance but applies submitting immediately", () => {
    const { rerender } = render(
      <TestConsumer liveMessageVersion={0} messages={[userMessage]} />,
    );
    const firstApproval = pendingToolApproval("approval-1", "pending");
    const secondApproval = pendingToolApproval("approval-2", "pending");

    rerender(
      <TestConsumer
        liveMessageVersion={1}
        messages={[userMessage]}
        pendingToolApprovals={[firstApproval, secondApproval]}
      />,
    );

    expect(screen.getByTestId("approval-ids")).toHaveTextContent("approval-1");
    expect(screen.getByTestId("approval-ids")).not.toHaveTextContent(
      "approval-2",
    );

    rerender(
      <TestConsumer
        liveMessageVersion={1}
        messages={[userMessage]}
        pendingToolApprovals={[
          pendingToolApproval("approval-1", "submitting"),
          secondApproval,
        ]}
      />,
    );
    expect(screen.getByTestId("approval-statuses")).toHaveTextContent(
      "submitting",
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId("approval-ids")).toHaveTextContent(
      "approval-1,approval-2",
    );
  });

  it("does not animate for reduced-motion users", () => {
    prefersReducedMotion = true;
    const content =
      "This large chunk should be applied at once when reduced motion is enabled.";
    const { rerender } = render(
      <TestConsumer liveMessageVersion={0} messages={[userMessage]} />,
    );

    rerender(
      <TestConsumer
        liveMessageVersion={1}
        messages={[userMessage, assistantMessage(content)]}
      />,
    );

    expect(screen.getByTestId("content")).toHaveTextContent(content);
    expect(screen.getByTestId("animating")).toHaveTextContent("false");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("flushes active animation when animation becomes disabled", () => {
    const content =
      "This active animation should finish when reduced motion becomes enabled.";
    const { rerender } = render(
      <TestConsumer liveMessageVersion={0} messages={[userMessage]} />,
    );

    rerender(
      <TestConsumer
        liveMessageVersion={1}
        messages={[userMessage, assistantMessage(content)]}
      />,
    );
    prefersReducedMotion = true;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.getByTestId("content")).toHaveTextContent(content);
    expect(screen.getByTestId("animating")).toHaveTextContent("false");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels animation when the transcript unmounts", () => {
    const content =
      "This buffered response must not update the transcript after it unmounts.";
    const { rerender, unmount } = render(
      <TestConsumer liveMessageVersion={0} messages={[userMessage]} />,
    );

    rerender(
      <TestConsumer
        liveMessageVersion={1}
        messages={[userMessage, assistantMessage(content)]}
      />,
    );
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
