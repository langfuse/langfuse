import { type SessionTraceObservation } from "./SessionObservationIO";
import {
  buildSessionSearchDocuments,
  createSessionMessageSearchController,
  selectVisibleSessionObservations,
  type SessionSearchDocument,
} from "./sessionMessageSearchController";

const observation = (
  overrides: Partial<SessionTraceObservation> = {},
): SessionTraceObservation =>
  ({
    id: "observation-1",
    name: "generation",
    startTime: new Date("2026-07-24T08:00:00Z"),
    input: null,
    output: null,
    metadata: {},
    inputLength: 0,
    outputLength: 0,
    inputTruncated: false,
    outputTruncated: false,
    metadataTruncated: false,
    metadataLength: 0,
    ...overrides,
  }) as SessionTraceObservation;

describe("session message search corpus", () => {
  it("searches only rendered conversation messages", () => {
    const documents = buildSessionSearchDocuments({
      traceId: "trace-1",
      traceIndex: 0,
      observations: [
        observation({
          input: JSON.stringify({
            messages: [
              { role: "system", content: "hidden system needle" },
              { role: "user", content: "visible input needle" },
              {
                role: "assistant",
                content: "visible output needle",
              },
            ],
            hiddenTool: "hidden tool needle",
          }),
        }),
      ],
      contentMode: "conversation",
      showSystemPrompt: false,
    });

    expect(documents.map((document) => document.text).join("\n")).toContain(
      "visible input needle",
    );
    expect(documents.map((document) => document.text).join("\n")).toContain(
      "visible output needle",
    );
    expect(documents.map((document) => document.text).join("\n")).not.toContain(
      "hidden system needle",
    );
    expect(documents.map((document) => document.text).join("\n")).not.toContain(
      "hidden tool needle",
    );
  });

  it("includes system messages when the compact-view option shows them", () => {
    const documents = buildSessionSearchDocuments({
      traceId: "trace-1",
      traceIndex: 0,
      observations: [
        observation({
          input: JSON.stringify({
            messages: [
              { role: "system", content: "shown system needle" },
              { role: "user", content: "visible input" },
            ],
          }),
        }),
      ],
      contentMode: "conversation",
      showSystemPrompt: true,
    });

    expect(documents.map((document) => document.text).join("\n")).toContain(
      "shown system needle",
    );
  });

  it("gives messages in the same I/O field stable distinct search ids", () => {
    const documents = buildSessionSearchDocuments({
      traceId: "trace-1",
      traceIndex: 0,
      observations: [
        observation({
          input: JSON.stringify({
            messages: [
              { role: "user", content: "first needle" },
              { role: "user", content: "second needle" },
            ],
          }),
        }),
      ],
      contentMode: "conversation",
      showSystemPrompt: false,
    });

    expect(new Set(documents.map(({ id }) => id)).size).toBe(documents.length);
  });

  it("searches JSON keys and values in all-content mode", () => {
    const documents = buildSessionSearchDocuments({
      traceId: "trace-1",
      traceIndex: 0,
      observations: [
        observation({
          input: JSON.stringify({ nested: { needleKey: "needle value" } }),
        }),
      ],
      contentMode: "all",
      showSystemPrompt: false,
    });

    const text = documents.map((document) => document.text).join("\n");
    expect(text).toContain('"needleKey"');
    expect(text).toContain('"needle value"');
  });

  it("searches the formatted chat model in all-content mode", () => {
    const documents = buildSessionSearchDocuments({
      traceId: "trace-1",
      traceIndex: 0,
      observations: [
        observation({
          input: JSON.stringify({
            messages: [
              {
                role: "system",
                content: "system message",
                tools: [
                  {
                    name: "lookup",
                    description: "tool definition needle",
                    parameters: { type: "object" },
                  },
                ],
              },
              { role: "user", content: "visible message needle" },
            ],
            requestContext: { tenant: "additional input needle" },
          }),
          output: JSON.stringify({
            role: "assistant",
            tool_calls: [
              {
                id: "call-1",
                name: "lookup",
                arguments: { query: "tool call needle" },
              },
            ],
          }),
        }),
      ],
      contentMode: "all",
      showSystemPrompt: false,
    });

    const text = documents.map((document) => document.text).join("\n");
    expect(text).toContain("visible message needle");
    expect(text).toContain("tool definition needle");
    expect(text).toContain("additional input needle");
    expect(text).toContain("tool call needle");
    expect(text).not.toContain('"messages"');
  });

  it("excludes thinking from formatted conversation search", () => {
    for (const contentMode of ["conversation", "all"] as const) {
      const documents = buildSessionSearchDocuments({
        traceId: "trace-1",
        traceIndex: 0,
        observations: [
          observation({
            input: JSON.stringify({
              messages: [
                {
                  role: "assistant",
                  content: "visible answer needle",
                  thinking: [
                    {
                      type: "thinking",
                      content: "hidden thinking needle",
                      summary: "hidden summary needle",
                    },
                  ],
                  redacted_thinking: [
                    {
                      type: "redacted_thinking",
                      data: "hidden redacted needle",
                    },
                  ],
                },
              ],
            }),
          }),
        ],
        contentMode,
        showSystemPrompt: false,
      });

      const text = documents.map((document) => document.text).join("\n");
      expect(text).toContain("visible answer needle");
      expect(text).not.toContain("hidden thinking needle");
      expect(text).not.toContain("hidden summary needle");
      expect(text).not.toContain("hidden redacted needle");
    }
  });

  it("does not search beyond the bounded truncated preview", () => {
    const documents = buildSessionSearchDocuments({
      traceId: "trace-1",
      traceIndex: 0,
      observations: [
        observation({
          input: `${"x".repeat(4_000)}hidden needle`,
          inputLength: 5_000,
          inputTruncated: true,
        }),
      ],
      contentMode: "all",
      showSystemPrompt: false,
    });

    expect(documents).toHaveLength(1);
    expect(documents[0]?.text).toHaveLength(4_000);
    expect(documents[0]?.text).not.toContain("hidden needle");
  });

  it("uses the same synthetic-row de-duplication as the rendered feed", () => {
    const sharedInput = JSON.stringify({ message: "needle" });
    const visible = selectVisibleSessionObservations({
      traceId: "trace-1",
      observations: [
        observation({
          id: "t-trace-1",
          input: sharedInput,
          inputLength: sharedInput.length,
        }),
        observation({
          id: "real-observation",
          input: sharedInput,
          inputLength: sharedInput.length,
        }),
      ],
    });

    expect(visible.visibleObservations.map(({ id }) => id)).toEqual([
      "real-observation",
    ]);
  });
});

describe("session message search controller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  const searchDocument = (
    overrides: Partial<SessionSearchDocument> = {},
  ): SessionSearchDocument => ({
    id: "trace-1:observation-1:input",
    targetId: "trace-1:observation-1",
    traceId: "trace-1",
    traceIndex: 0,
    observationId: "observation-1",
    field: "input",
    label: "Input",
    text: "Langfuse and Ｌａｎｇｆｕｓｅ",
    ...overrides,
  });

  const commitQuery = async (
    controller: ReturnType<typeof createSessionMessageSearchController>,
    query: string,
  ) => {
    controller.setQueryInput(query);
    await vi.advanceTimersByTimeAsync(150);
    await vi.waitFor(() =>
      expect(controller.getSnapshot().isLoading).toBe(false),
    );
  };

  it("loads once, normalizes matches, and navigates across virtual traces", async () => {
    const loadDocuments = vi.fn().mockResolvedValue({
      documents: [
        searchDocument(),
        searchDocument({
          id: "trace-2:observation-2:output",
          targetId: "trace-2:observation-2",
          traceId: "trace-2",
          traceIndex: 1,
          observationId: "observation-2",
          field: "output",
          label: "Output",
          text: "Langfuse",
        }),
      ],
      failedTraceCount: 0,
    });
    const navigateToTrace = vi.fn();
    const controller = createSessionMessageSearchController({ loadDocuments });
    controller.setTraceNavigator(navigateToTrace);

    await commitQuery(controller, "langfuse");

    expect(loadDocuments).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().matches).toHaveLength(3);
    expect(navigateToTrace).toHaveBeenLastCalledWith(0);

    controller.nextMatch();
    controller.nextMatch();

    expect(controller.getSnapshot().activeMatch?.traceId).toBe("trace-2");
    expect(navigateToTrace).toHaveBeenLastCalledWith(1);

    await commitQuery(controller, "and");
    expect(loadDocuments).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().matches).toHaveLength(1);
  });

  it("invalidates the cached corpus when the rendered search scope changes", async () => {
    const loadDocuments = vi.fn().mockResolvedValue({
      documents: [searchDocument()],
      failedTraceCount: 0,
    });
    const controller = createSessionMessageSearchController({ loadDocuments });

    await commitQuery(controller, "Langfuse");
    controller.setScope("next-filter");
    await vi.waitFor(() => expect(loadDocuments).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(controller.getSnapshot().isLoading).toBe(false),
    );

    expect(controller.getSnapshot().matches).toHaveLength(2);
  });

  it("retries a partial corpus on the next committed query", async () => {
    const loadDocuments = vi
      .fn()
      .mockResolvedValueOnce({
        documents: [searchDocument()],
        failedTraceCount: 1,
      })
      .mockResolvedValueOnce({
        documents: [
          searchDocument(),
          searchDocument({
            id: "trace-2:observation-2:output",
            targetId: "trace-2:observation-2",
            traceId: "trace-2",
            traceIndex: 1,
            observationId: "observation-2",
            field: "output",
            label: "Output",
            text: "second complete result",
          }),
        ],
        failedTraceCount: 0,
      });
    const controller = createSessionMessageSearchController({ loadDocuments });

    await commitQuery(controller, "Langfuse");
    expect(controller.getSnapshot().failedTraceCount).toBe(1);

    await commitQuery(controller, "result");

    expect(loadDocuments).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().failedTraceCount).toBe(0);
    expect(controller.getSnapshot().matches).toHaveLength(1);
  });

  it("emits a flushed zero-match query before navigation returns", async () => {
    const controller = createSessionMessageSearchController({
      loadDocuments: vi.fn().mockResolvedValue({
        documents: [searchDocument()],
        failedTraceCount: 0,
      }),
    });

    await commitQuery(controller, "Langfuse");
    controller.setQueryInput("missing");
    controller.nextMatch();

    expect(controller.getSnapshot().query).toBe("missing");
    expect(controller.getSnapshot().matches).toHaveLength(0);
    expect(controller.getSnapshot().activeMatchIndex).toBe(-1);
  });

  it("marks and scrolls to the containing target for a hidden match", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const root = document.createElement("div");
    const scrollIntoView = vi.fn();
    root.scrollIntoView = scrollIntoView;
    document.body.appendChild(root);
    const controller = createSessionMessageSearchController({
      loadDocuments: vi.fn().mockResolvedValue({
        documents: [searchDocument({ text: "hidden needle" })],
        failedTraceCount: 0,
      }),
    });
    controller.registerTarget("trace-1:observation-1", root);

    await commitQuery(controller, "hidden needle");

    expect(root).toHaveAttribute("data-session-search-hidden-match");
    expect(scrollIntoView).toHaveBeenCalled();

    controller.closeSearch();
    expect(root).not.toHaveAttribute("data-session-search-hidden-match");
    controller.dispose();
  });

  it("highlights a formatted match split across DOM text nodes", async () => {
    const highlights = new Map<string, { ranges: Range[] }>();
    class Highlight {
      ranges: Range[];

      constructor(...ranges: Range[]) {
        this.ranges = ranges;
      }
    }
    vi.stubGlobal("CSS", {
      highlights: {
        set: (name: string, highlight: { ranges: Range[] }) =>
          highlights.set(name, highlight),
        delete: (name: string) => highlights.delete(name),
      },
    });
    vi.stubGlobal("Highlight", Highlight);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const root = document.createElement("div");
    root.innerHTML = "<p>formatted <strong>message</strong></p>";
    const paragraph = root.querySelector("p");
    if (paragraph) paragraph.scrollIntoView = vi.fn();
    document.body.appendChild(root);
    const controller = createSessionMessageSearchController({
      loadDocuments: vi.fn().mockResolvedValue({
        documents: [searchDocument({ text: "formatted message" })],
        failedTraceCount: 0,
      }),
    });
    controller.registerTarget("trace-1:observation-1", root);

    await commitQuery(controller, "formatted message");

    const matchRanges = highlights.get("session-message-search-match")?.ranges;
    expect(matchRanges).toHaveLength(1);
    expect(matchRanges?.[0]?.toString()).toBe("formatted message");

    controller.dispose();
  });
});
