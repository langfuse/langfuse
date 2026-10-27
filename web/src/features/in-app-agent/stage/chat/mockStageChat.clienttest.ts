import type { CapturedPageContext } from "@/src/features/page-context";
import { buildMockAssistantReply } from "@/src/features/in-app-agent/stage/chat/buildMockAssistantReply";
import {
  createMockStageChatStore,
  MOCK_REPLY_TIMINGS,
} from "@/src/features/in-app-agent/stage/chat/mockStageChatStore";

const context: CapturedPageContext = {
  version: 1,
  kind: "trace",
  label: "Trace",
  id: "trace-1",
  title: "support-copilot",
  surface: "page",
  path: "/project/p/traces/trace-1",
  capturedAt: "2026-01-01T00:00:00.000Z",
  facts: [
    { key: "latency_ms", label: "Latency", display: "12.2s", value: 12_220 },
    { key: "cost_usd", label: "Cost", display: "$0.016", value: 0.016 },
    { key: "observations", label: "Observations", display: "16", value: 16 },
  ],
  focus: {
    kind: "observation",
    label: "Generation",
    id: "obs-chat",
    title: "llm.chat",
    facts: [
      { key: "latency_ms", label: "Latency", display: "1.9s (16%)" },
      { key: "model", label: "Model", display: "gpt-4.1" },
    ],
  },
  related: [
    {
      kind: "observation",
      label: "Tool",
      id: "obs-refund",
      title: "stripe.create-refund",
      reason: "error",
      facts: [
        {
          key: "status_message",
          label: "Status",
          display: "card_declined",
        },
      ],
    },
    {
      kind: "observation",
      label: "Generation",
      id: "obs-draft",
      title: "draft-response",
      reason: "slowest step",
      facts: [{ key: "latency_ms", label: "Latency", display: "1.6s (13%)" }],
    },
  ],
};

describe("buildMockAssistantReply", () => {
  it("answers latency questions from the trace's own numbers", () => {
    const reply = buildMockAssistantReply("Why is this so slow?", context);

    expect(reply).toContain("**12.2s**");
    expect(reply).toContain("**16 observations**");
    expect(reply).toContain(
      "The slowest step is `draft-response` (generation, 1.6s (13%))",
    );
    expect(reply).toContain(
      "`llm.chat` (generation, 1.9s (16%), gpt-4.1) selected",
    );
  });

  it("surfaces failing steps with their status when asked about errors", () => {
    expect(buildMockAssistantReply("what failed here?", context)).toContain(
      '`stripe.create-refund` (tool) failed: "card_declined"',
    );
  });

  it("says plainly that the answer is mocked", () => {
    expect(buildMockAssistantReply("hello", context)).toContain(
      "Mocked response",
    );
  });

  it("falls back to the snapshot's facts for pages without a trace", () => {
    expect(
      buildMockAssistantReply("hi", {
        ...context,
        kind: "page",
        label: "Page",
        title: "Dashboards",
        focus: undefined,
        related: undefined,
      }),
    ).toContain("You were looking at the page **Dashboards**");
  });
});

describe("createMockStageChatStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    let id = 0;
    return createMockStageChatStore({
      createId: () => `id-${++id}`,
      now: () => 0,
    });
  }

  it("attaches the page to the first message only and streams a reply", () => {
    const store = setup();
    const attachment = { context, thumbnail: null, aspectRatio: 1.6 };

    store.getState().actions.send("Why is this slow?", attachment);

    const [conversation] = store.getState().conversations;
    expect(conversation?.title).toBe("Why is this slow?");
    expect(conversation?.messages[0]?.attachment).toBe(attachment);
    expect(conversation?.messages[1]?.content.type).toBe("loading");

    vi.advanceTimersByTime(MOCK_REPLY_TIMINGS.thinkingMs + 10_000);

    expect(store.getState().respondingMessageId).toBeNull();
    const reply = store.getState().conversations[0]?.messages[1]?.content;
    expect(reply).toMatchObject({ type: "text", isStreaming: false });

    store.getState().actions.send("And the cost?", attachment);
    expect(
      store.getState().conversations[0]?.messages[2]?.attachment,
    ).toBeUndefined();
  });

  it("keeps the streamed text when stopped mid-reply", () => {
    const store = setup();
    store.getState().actions.send("Why is this slow?", {
      context,
      thumbnail: null,
      aspectRatio: 1.6,
    });

    vi.advanceTimersByTime(
      MOCK_REPLY_TIMINGS.thinkingMs + MOCK_REPLY_TIMINGS.wordIntervalMs * 3,
    );
    store.getState().actions.stop();

    const reply = store.getState().conversations[0]?.messages[1]?.content;
    expect(reply).toMatchObject({ type: "text", isStreaming: false });
    expect(reply?.type === "text" ? reply.text.length : 0).toBeGreaterThan(0);
    expect(store.getState().respondingMessageId).toBeNull();
  });

  it("starts a fresh conversation and keeps the previous one listed", () => {
    const store = setup();
    store.getState().actions.send("first question", {
      context,
      thumbnail: null,
      aspectRatio: 1.6,
    });
    vi.runAllTimers();

    store.getState().actions.newConversation();
    store.getState().actions.send("second question", {
      context,
      thumbnail: null,
      aspectRatio: 1.6,
    });

    expect(
      store.getState().conversations.map((conversation) => conversation.title),
    ).toEqual(["second question", "first question"]);
  });
});
