import { type SessionTraceObservation } from "./SessionObservationIO";
import {
  buildSessionSearchDocuments,
  createSessionMessageSearchController,
  loadSessionSearchRemoteResults,
  selectVisibleSessionObservations,
  type SessionSearchDocument,
} from "./sessionMessageSearchController";
import { isSessionSearchShortcutInScope } from "./SessionMessageSearch";

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

  it("searches metadata only when the JSON view shows it", () => {
    const buildDocuments = (includeMetadata: boolean) =>
      buildSessionSearchDocuments({
        traceId: "trace-1",
        traceIndex: 0,
        observations: [
          observation({
            input: JSON.stringify({ prompt: "hello" }),
            metadata: JSON.stringify({ tenant: "metadata needle" }),
          }),
        ],
        contentMode: "all",
        showSystemPrompt: false,
        includeMetadata,
      })
        .map((document) => document.text)
        .join("\n");

    expect(buildDocuments(false)).not.toContain("metadata needle");
    expect(buildDocuments(true)).toContain("metadata needle");
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
      expect(controller.getSnapshot().isRemoteLoading).toBe(false),
    );
  };

  it("pages past remote results that are already in the local corpus", async () => {
    const startTime = new Date("2026-07-24T08:00:00Z");
    const loadPage = vi
      .fn()
      .mockResolvedValueOnce({
        results: [
          {
            traceId: "trace-1",
            observationId: "observation-1",
            observationName: "local",
            traceName: "trace 1",
            startTime,
          },
        ],
        hasMore: true,
      })
      .mockResolvedValueOnce({
        results: [
          {
            traceId: "trace-2",
            observationId: "observation-2",
            observationName: "remote",
            traceName: "trace 2",
            startTime,
          },
        ],
        hasMore: false,
      });

    const result = await loadSessionSearchRemoteResults({
      limit: 1,
      localObservationIds: new Set(["observation-1"]),
      traceIndexById: new Map([
        ["trace-1", 0],
        ["trace-2", 1],
      ]),
      loadPage,
    });

    expect(loadPage).toHaveBeenNthCalledWith(1, { limit: 1, offset: 0 });
    expect(loadPage).toHaveBeenNthCalledWith(2, { limit: 1, offset: 1 });
    expect(result.results.map(({ observationId }) => observationId)).toEqual([
      "observation-2",
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("searches cached documents immediately while remote results load", async () => {
    let resolveRemote:
      | ((value: { results: never[]; hasMore: false }) => void)
      | undefined;
    const searchRemote = vi.fn(
      () =>
        new Promise<{ results: never[]; hasMore: false }>((resolve) => {
          resolveRemote = resolve;
        }),
    );
    const controller = createSessionMessageSearchController({
      getLocalDocuments: () => [searchDocument()],
      searchRemote,
    });

    controller.setQueryInput("langfuse");

    expect(controller.getSnapshot().matches).toHaveLength(2);
    expect(controller.getSnapshot().isRemoteLoading).toBe(true);
    expect(searchRemote).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(150);
    expect(searchRemote).toHaveBeenCalledWith(
      "langfuse",
      new Set(["observation-1"]),
    );
    resolveRemote?.({ results: [], hasMore: false });
    await vi.waitFor(() =>
      expect(controller.getSnapshot().isRemoteLoading).toBe(false),
    );
  });

  it("normalizes local matches and navigates across virtual traces", async () => {
    const getLocalDocuments = vi.fn(() => [
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
    ]);
    const navigateToTrace = vi.fn();
    const controller = createSessionMessageSearchController({
      getLocalDocuments,
      searchRemote: vi.fn().mockResolvedValue({
        results: [],
        hasMore: false,
      }),
    });
    controller.setTraceNavigator(navigateToTrace);

    await commitQuery(controller, "langfuse");

    expect(getLocalDocuments).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().matches).toHaveLength(3);
    expect(navigateToTrace).toHaveBeenLastCalledWith(0);

    controller.nextMatch();
    controller.nextMatch();

    expect(controller.getSnapshot().activeMatch?.traceId).toBe("trace-2");
    expect(navigateToTrace).toHaveBeenLastCalledWith(1);

    await commitQuery(controller, "and");
    expect(getLocalDocuments).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().matches).toHaveLength(1);
  });

  it("keeps the active result sequence stable when virtual targets mount", async () => {
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    let documents = [
      searchDocument({ text: "needle alpha" }),
      searchDocument({
        id: "trace-2:observation-2:input",
        targetId: "trace-2:observation-2",
        traceId: "trace-2",
        traceIndex: 1,
        observationId: "observation-2",
        text: "needle alpha",
      }),
    ];
    const getLocalDocuments = vi.fn(() => documents);
    const controller = createSessionMessageSearchController({
      getLocalDocuments,
      searchRemote: vi.fn().mockResolvedValue({
        results: [],
        hasMore: false,
      }),
    });

    await commitQuery(controller, "needle");
    controller.previousMatch();
    const activeMatchKey = controller.getSnapshot().activeMatch?.key;

    documents = [
      ...documents,
      searchDocument({
        id: "trace-3:observation-3:input",
        targetId: "trace-3:observation-3",
        traceId: "trace-3",
        traceIndex: 2,
        observationId: "observation-3",
        text: "needle beta",
      }),
    ];
    const root = document.createElement("div");
    root.scrollIntoView = vi.fn();
    controller.registerTarget("trace-3:observation-3", root);

    expect(controller.getSnapshot().matches).toHaveLength(2);
    expect(controller.getSnapshot().activeMatch?.key).toBe(activeMatchKey);
    expect(getLocalDocuments).toHaveBeenCalledTimes(1);

    await commitQuery(controller, "beta");
    expect(getLocalDocuments).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().matches).toHaveLength(1);
    expect(controller.getSnapshot().activeMatch?.traceId).toBe("trace-3");
  });

  it("keeps unmatched target snapshots stable across query updates", async () => {
    const controller = createSessionMessageSearchController({
      getLocalDocuments: () => [searchDocument()],
      searchRemote: vi.fn().mockResolvedValue({
        results: [],
        hasMore: false,
      }),
    });

    await commitQuery(controller, "Langfuse");
    expect(controller.getTargetSnapshot("trace-1:observation-1")).toMatchObject(
      {
        query: "Langfuse",
        activeMatchIndex: 0,
      },
    );
    const unmatchedSnapshot = controller.getTargetSnapshot(
      "trace-2:observation-2",
    );

    await commitQuery(controller, "missing");

    expect(controller.getTargetSnapshot("trace-2:observation-2")).toBe(
      unmatchedSnapshot,
    );
    expect(unmatchedSnapshot).toEqual({
      query: "",
      activeMatchIndex: -1,
    });
  });

  it("refreshes the local corpus and remote search when scope changes", async () => {
    const getLocalDocuments = vi.fn(() => [searchDocument()]);
    const searchRemote = vi.fn().mockResolvedValue({
      results: [],
      hasMore: false,
    });
    const controller = createSessionMessageSearchController({
      getLocalDocuments,
      searchRemote,
    });

    await commitQuery(controller, "Langfuse");
    controller.setScope("next-filter");
    await vi.advanceTimersByTimeAsync(150);

    expect(getLocalDocuments).toHaveBeenCalledTimes(2);
    expect(searchRemote).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().matches).toHaveLength(2);
  });

  it("keeps remote candidates separate and omits locally matched observations", async () => {
    const searchRemote = vi.fn().mockResolvedValue({
      results: [
        {
          key: "trace-1:observation-1",
          traceId: "trace-1",
          traceIndex: 0,
          observationId: "observation-1",
          observationName: "loaded",
          traceName: "trace 1",
          startTime: new Date("2026-07-24T08:00:00Z"),
        },
        {
          key: "trace-2:observation-2",
          traceId: "trace-2",
          traceIndex: 1,
          observationId: "observation-2",
          observationName: "not loaded",
          traceName: "trace 2",
          startTime: new Date("2026-07-24T09:00:00Z"),
        },
      ],
      hasMore: true,
    });
    const controller = createSessionMessageSearchController({
      getLocalDocuments: () => [searchDocument()],
      searchRemote,
    });
    const navigateToRemoteResult = vi.fn();
    controller.setRemoteNavigator(navigateToRemoteResult);

    await commitQuery(controller, "Langfuse");

    expect(controller.getSnapshot().remoteResults).toHaveLength(1);
    expect(controller.getSnapshot().remoteResults[0]?.observationId).toBe(
      "observation-2",
    );
    expect(controller.getSnapshot().remoteHasMore).toBe(true);
    controller.openRemoteResult(controller.getSnapshot().remoteResults[0]!);
    expect(navigateToRemoteResult).toHaveBeenCalledWith(
      expect.objectContaining({ observationId: "observation-2" }),
    );
  });

  it("commits and emits a zero-match query before navigation returns", () => {
    const controller = createSessionMessageSearchController({
      getLocalDocuments: () => [searchDocument()],
      searchRemote: vi.fn().mockResolvedValue({
        results: [],
        hasMore: false,
      }),
    });
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.setQueryInput("Langfuse");
    controller.setQueryInput("missing");
    controller.nextMatch();

    expect(controller.getSnapshot().query).toBe("missing");
    expect(controller.getSnapshot().matches).toHaveLength(0);
    expect(controller.getSnapshot().activeMatchIndex).toBe(-1);
    expect(listener).toHaveBeenCalled();
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
      getLocalDocuments: () => [searchDocument({ text: "hidden needle" })],
      searchRemote: vi.fn().mockResolvedValue({
        results: [],
        hasMore: false,
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
      getLocalDocuments: () => [searchDocument({ text: "formatted message" })],
      searchRemote: vi.fn().mockResolvedValue({
        results: [],
        hasMore: false,
      }),
    });
    controller.registerTarget("trace-1:observation-1", root);

    await commitQuery(controller, "formatted message");

    const matchRanges = highlights.get("session-message-search-match")?.ranges;
    expect(matchRanges).toHaveLength(1);
    expect(matchRanges?.[0]?.toString()).toBe("formatted message");

    controller.dispose();
  });

  it("does not turn an unindexed role header into a phantom DOM match", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const root = document.createElement("div");
    root.innerHTML =
      '<div class="io-message-header">assistant</div><p>answer</p>';
    root.scrollIntoView = vi.fn();
    document.body.appendChild(root);
    const controller = createSessionMessageSearchController({
      getLocalDocuments: () => [searchDocument({ text: "assistant" })],
      searchRemote: vi.fn().mockResolvedValue({
        results: [],
        hasMore: false,
      }),
    });
    controller.registerTarget("trace-1:observation-1", root);

    await commitQuery(controller, "assistant");

    expect(root).toHaveAttribute("data-session-search-hidden-match");
    controller.dispose();
  });
});

describe("session message search shortcut scope", () => {
  it("uses session search for page focus but ignores focused overlays", () => {
    const root = document.createElement("div");
    const inside = document.createElement("button");
    const outside = document.createElement("button");
    const headerSearch = document.createElement("input");
    headerSearch.setAttribute("data-session-message-search-control", "");
    root.appendChild(inside);
    document.body.append(root, outside, headerSearch);

    expect(
      isSessionSearchShortcutInScope(root, document.body, document.body),
    ).toBe(true);
    expect(isSessionSearchShortcutInScope(root, document, document.body)).toBe(
      true,
    );
    expect(isSessionSearchShortcutInScope(root, outside, outside)).toBe(false);
    expect(
      isSessionSearchShortcutInScope(root, headerSearch, headerSearch),
    ).toBe(true);
    expect(isSessionSearchShortcutInScope(root, inside, outside)).toBe(true);
    expect(isSessionSearchShortcutInScope(root, document, inside)).toBe(true);
  });
});
