import { act, fireEvent, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSessionConversationTimelineController } from "./useSessionConversationTimelineController";
import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";
import { getScrollSpyAnchor } from "@/src/hooks/useVirtualizedScrollSpy";

const { feedRef, virtualizer } = vi.hoisted(() => ({
  feedRef: { current: null as HTMLDivElement | null },
  virtualizer: {
    scrollOffset: 0,
    getTotalSize: (): number => 10_000,
    getOffsetForIndex: (index: number) => [index * 100],
    get measurementsCache() {
      return Array.from({ length: 100 }, (_, index) => ({
        start: index * 100,
      }));
    },
    getVirtualItems: () => [
      { index: 0, start: 0, end: 100 },
      { index: 1, start: 100, end: 200 },
      { index: 2, start: 200, end: 10_000 },
    ],
  },
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => virtualizer,
}));
vi.mock("@/src/hooks/useElementSize", () => ({
  useElementSize: () => [feedRef, { height: 500 }],
}));

const trace = {
  id: "trace",
  name: "Trace",
  timestamp: new Date(0),
  environment: "production",
  userId: null,
  observationCount: 1,
  latencyMs: 1000,
  scores: [],
} satisfies EventSessionTrace;

afterEach(() => {
  feedRef.current = null;
  virtualizer.scrollOffset = 0;
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.clearAllMocks();
});

function createMeasuredFeed() {
  const feed = document.createElement("div");
  feedRef.current = feed;
  Object.defineProperty(feed, "clientHeight", {
    value: 500,
    configurable: true,
  });
  feed.getBoundingClientRect = () => new DOMRect(0, 200, 100, 500);
  feed.scrollTo = vi.fn((options?: ScrollToOptions | number) => {
    if (typeof options !== "object") return;
    feed.scrollTop = options.top ?? 0;
    virtualizer.scrollOffset = feed.scrollTop;
  });
  return feed;
}

function appendMeasuredRow(
  feed: HTMLDivElement,
  itemId: string,
  rowId: string,
  top: number,
) {
  const entry = document.createElement("div");
  entry.dataset.sessionTraceId = trace.id;
  entry.dataset.sessionItemId = itemId;
  const row = document.createElement("div");
  row.dataset.sessionTranscriptRowId = rowId;
  row.getBoundingClientRect = () =>
    new DOMRect(0, 200 + top - feed.scrollTop, 100, 100);
  entry.append(row);
  feed.append(entry);
  return row;
}

describe("useSessionConversationTimelineController", () => {
  it.each([300, 500, 800])(
    "aligns with 20%% of the actual %spx scroll viewport rather than the bounding box or window",
    (height) => {
      const feed = createMeasuredFeed();
      Object.defineProperty(feed, "clientHeight", {
        value: height,
        configurable: true,
      });
      appendMeasuredRow(feed, "trace:0", "0:0", 700);
      const { result } = renderHook(() =>
        useSessionConversationTimelineController([
          { trace, itemId: "trace:0" },
        ]),
      );
      act(() => result.current.onSelect(0, undefined, "0:0"));
      expect(feed.scrollTop).toBe(700 - height * 0.2);
    },
  );

  it("corrects navigation and recomputes the scroll-spy anchor when the viewport resizes", async () => {
    const feed = createMeasuredFeed();
    appendMeasuredRow(feed, "trace:2", "2:0", 140);
    const { result, rerender } = renderHook(() =>
      useSessionConversationTimelineController([
        { trace, itemId: "trace:0" },
        { trace, itemId: "trace:2" },
      ]),
    );
    act(() => result.current.onSelect(1, undefined, "2:0"));
    expect(feed.scrollTop).toBe(40);
    Object.defineProperty(feed, "clientHeight", { value: 300 });
    rerender();
    await waitFor(() => expect(feed.scrollTop).toBe(80));
    await act(
      async () =>
        await new Promise((resolve) => window.setTimeout(resolve, 300)),
    );
    virtualizer.scrollOffset = 0;
    rerender();
    expect(result.current.activeItemId).toBe("trace:0");
  });

  it("bounds the fallback for a short entry before the earliest reachable anchor and releases it on resize", async () => {
    const feed = createMeasuredFeed();
    Object.defineProperty(feed, "clientHeight", {
      value: 800,
      configurable: true,
    });
    appendMeasuredRow(feed, "trace:0", "0:0", 0);
    const { result, rerender } = renderHook(() =>
      useSessionConversationTimelineController([
        { trace, itemId: "trace:0" },
        { trace, itemId: "trace:2" },
      ]),
    );
    act(() => result.current.onSelect(0));
    await act(
      async () =>
        await new Promise((resolve) => window.setTimeout(resolve, 300)),
    );
    expect(result.current.activeItemId).toBe("trace:0");
    Object.defineProperty(feed, "clientHeight", { value: 300 });
    feed.scrollTop = 100;
    virtualizer.scrollOffset = 100;
    rerender();
    expect(result.current.activeItemId).toBe("trace:2");
  });

  it.each(["wheel", "touchstart", "pointerdown", "keydown"])(
    "keeps fallback selection after %s until scrolling past the buffer",
    async (eventType) => {
      const feed = createMeasuredFeed();
      Object.defineProperty(feed, "clientHeight", { value: 800 });
      appendMeasuredRow(feed, "trace:0", "0:0", 0);
      const { result } = renderHook(() =>
        useSessionConversationTimelineController([
          { trace, itemId: "trace:0" },
          { trace, itemId: "trace:2" },
        ]),
      );
      act(() => result.current.onSelect(0));
      await act(
        async () =>
          await new Promise((resolve) => window.setTimeout(resolve, 300)),
      );
      fireEvent(
        feed,
        eventType === "keydown"
          ? new KeyboardEvent(eventType, { key: "ArrowDown" })
          : new Event(eventType),
      );
      expect(result.current.activeItemId).toBe("trace:0");
      feed.scrollTop = 80;
      fireEvent.scroll(feed);
      expect(result.current.activeItemId).toBe("trace:0");
      feed.scrollTop = 81;
      fireEvent.scroll(feed);
      expect(result.current.activeItemId).toBe("trace:2");
    },
  );

  it("uses content starts rather than clamped scroll offsets at the natural bottom", () => {
    const feed = createMeasuredFeed();
    appendMeasuredRow(feed, "trace:2", "2:0", 9_750);
    vi.spyOn(virtualizer, "getOffsetForIndex").mockReturnValue([9_500]);
    vi.spyOn(virtualizer, "measurementsCache", "get").mockReturnValue([
      { start: 0 },
      { start: 9_700 },
      { start: 10_000 },
    ]);
    const { result } = renderHook(() =>
      useSessionConversationTimelineController([
        { trace, itemId: "trace:0" },
        { trace, itemId: "trace:2" },
      ]),
    );
    act(() => result.current.onSelect(1));
    expect(
      getScrollSpyAnchor({
        scrollOffset: feed.scrollTop,
        viewportHeight: 500,
        totalSize: 10_000,
        endTransitionRatio: 0.2,
        viewportInset: 100,
      }),
    ).toBeCloseTo(9_700);
  });

  it("navigates to rows without an observation and releases selection to the scroll spy", async () => {
    const feed = createMeasuredFeed();
    appendMeasuredRow(feed, "trace:2", "2:0", 140);
    const { result, rerender } = renderHook(() =>
      useSessionConversationTimelineController([
        { trace, itemId: "trace:0" },
        { trace, itemId: "trace:2" },
        { trace, itemId: "trace:4" },
      ]),
    );
    act(() => result.current.onSelect(1, undefined, "2:0"));
    expect(result.current.activeItemId).toBe("trace:2");
    expect(feed.scrollTop).toBe(40);
    await act(
      async () =>
        await new Promise((resolve) => window.setTimeout(resolve, 300)),
    );
    virtualizer.scrollOffset = 200;
    rerender();
    expect(result.current.activeItemId).toBe("trace:4");
  });

  it("lets the latest click win when an earlier row mounts later", async () => {
    const feed = createMeasuredFeed();
    const { result } = renderHook(() =>
      useSessionConversationTimelineController([
        { trace, itemId: "trace:0" },
        { trace, itemId: "trace:2" },
      ]),
    );
    act(() => result.current.onSelect(0, "generation", "0:0"));
    appendMeasuredRow(feed, "trace:2", "2:0", 150);
    act(() => result.current.onSelect(1, undefined, "2:0"));
    appendMeasuredRow(feed, "trace:0", "0:0", 40);
    await waitFor(() => expect(feed.scrollTop).toBe(50));
    await act(
      async () =>
        await new Promise((resolve) => window.setTimeout(resolve, 180)),
    );
    expect(feed.scrollTop).toBe(50);
    expect(result.current.activeItemId).toBe("trace:2");
  });

  it("corrects a target when mounted content changes its measured position", async () => {
    const feed = createMeasuredFeed();
    const row = appendMeasuredRow(feed, "trace:2", "2:0", 120);
    const { result } = renderHook(() =>
      useSessionConversationTimelineController([
        { trace, itemId: "trace:0" },
        { trace, itemId: "trace:2" },
      ]),
    );
    act(() => result.current.onSelect(1, undefined, "2:0"));
    expect(feed.scrollTop).toBe(20);
    row.getBoundingClientRect = () =>
      new DOMRect(0, 200 + 170 - feed.scrollTop, 100, 100);
    await waitFor(() => expect(feed.scrollTop).toBe(70));
  });

  it("reconciles a loading placeholder that splits into threads", async () => {
    const feed = createMeasuredFeed();
    const { result, rerender } = renderHook(
      ({ loaded }) =>
        useSessionConversationTimelineController(
          loaded
            ? [
                { trace, itemId: "trace:0" },
                { trace, itemId: "trace:2" },
              ]
            : [{ trace }],
        ),
      { initialProps: { loaded: false } },
    );
    act(() => result.current.onSelect(0));
    appendMeasuredRow(feed, "trace:0", "0:0", 10);
    rerender({ loaded: true });
    await waitFor(() => expect(result.current.activeItemId).toBe("trace:0"));
    expect(feed.scrollTop).toBe(0);
  });

  it("aligns rows with the scroll-spy anchor in offset containers rather than centering", () => {
    const feed = document.createElement("div");
    feedRef.current = feed;
    Object.defineProperty(feed, "clientHeight", { value: 500 });
    feed.scrollTop = 100;
    feed.getBoundingClientRect = () => new DOMRect(0, 200, 100, 500);
    feed.scrollTo = vi.fn();
    const item = document.createElement("div");
    item.dataset.sessionTraceId = trace.id;
    const row = document.createElement("div");
    row.dataset.sessionObservationId = "generation";
    row.dataset.sessionTranscriptRowId = "0:1";
    row.getBoundingClientRect = () => new DOMRect(0, 450, 100, 100);
    item.append(row);
    feed.append(item);
    const { result } = renderHook(() =>
      useSessionConversationTimelineController([{ trace }]),
    );
    act(() => result.current.onSelect(0, "generation", "0:1"));
    expect(feed.scrollTo).toHaveBeenCalledWith({
      top: 250,
      behavior: "smooth",
    });
  });

  it.each(["wheel", "touchstart", "pointerdown", "keydown"])(
    "cancels delayed row navigation on %s intent",
    async (eventType) => {
      const feed = document.createElement("div");
      feedRef.current = feed;
      feed.scrollTo = vi.fn();
      const { result } = renderHook(() =>
        useSessionConversationTimelineController([{ trace }]),
      );
      act(() => result.current.onSelect(0, "generation", "0:1"));
      fireEvent(
        feed,
        eventType === "keydown"
          ? new KeyboardEvent("keydown", { key: "PageUp" })
          : new Event(eventType),
      );
      vi.mocked(feed.scrollTo).mockClear();
      const item = document.createElement("div");
      item.dataset.sessionTraceId = trace.id;
      const row = document.createElement("div");
      row.dataset.sessionObservationId = "generation";
      row.dataset.sessionTranscriptRowId = "0:1";
      item.append(row);
      feed.append(item);
      await act(async () => await Promise.resolve());
      expect(feed.scrollTo).not.toHaveBeenCalled();
    },
  );

  it("expires a missing row request without scrolling when it eventually mounts", async () => {
    vi.useFakeTimers();
    const feed = createMeasuredFeed();
    const { result } = renderHook(() =>
      useSessionConversationTimelineController([
        { trace, itemId: "trace:0" },
        { trace, itemId: "trace:2" },
      ]),
    );
    act(() => result.current.onSelect(1, undefined, "2:0"));
    await act(async () => await vi.advanceTimersByTimeAsync(5_001));
    vi.mocked(feed.scrollTo).mockClear();
    appendMeasuredRow(feed, "trace:2", "2:0", 150);
    await act(async () => await vi.advanceTimersByTimeAsync(100));
    expect(feed.scrollTo).not.toHaveBeenCalled();
  });

  it("retains only a fitting-list fallback and discards it when scrolling becomes possible", async () => {
    const feed = createMeasuredFeed();
    appendMeasuredRow(feed, "trace:4", "4:0", 200);
    const totalSize = vi
      .spyOn(virtualizer, "getTotalSize")
      .mockReturnValue(400);
    const { result, rerender } = renderHook(() =>
      useSessionConversationTimelineController([
        { trace, itemId: "trace:0" },
        { trace, itemId: "trace:2" },
        { trace, itemId: "trace:4" },
      ]),
    );
    act(() => result.current.onSelect(2));
    expect(result.current.activeItemId).toBe("trace:4");
    await act(
      async () =>
        await new Promise((resolve) => window.setTimeout(resolve, 300)),
    );
    expect(result.current.activeItemId).toBe("trace:4");
    totalSize.mockReturnValue(10_000);
    rerender();
    expect(result.current.activeItemId).toBe("trace:2");
  });

  it("selects the exact thread item when observations repeat", () => {
    const feed = document.createElement("div");
    Object.defineProperty(feed, "clientHeight", { value: 500 });
    feedRef.current = feed;
    feed.scrollTo = vi.fn();
    for (const [index, itemId] of ["trace:0", "trace:2"].entries()) {
      const item = document.createElement("div");
      item.dataset.sessionTraceId = trace.id;
      item.dataset.sessionItemId = itemId;
      const row = document.createElement("div");
      row.dataset.sessionObservationId = "generation";
      row.getBoundingClientRect = () => new DOMRect(0, index * 100, 100, 0);
      item.append(row);
      feed.append(item);
    }
    const { result } = renderHook(() =>
      useSessionConversationTimelineController([
        { trace, itemId: "trace:0" },
        { trace, itemId: "trace:2" },
      ]),
    );
    act(() => result.current.onSelect(1, "generation"));
    expect(result.current.activeItemId).toBe("trace:2");
    expect(feed.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: "smooth",
    });
  });
  it("scrolls to the exact row when multiple rows share an observation", () => {
    const feed = document.createElement("div");
    Object.defineProperty(feed, "clientHeight", { value: 500 });
    const traceElement = document.createElement("div");
    traceElement.dataset.sessionTraceId = trace.id;
    feed.append(traceElement);
    feedRef.current = feed;
    feed.scrollTo = vi.fn();
    for (const [index, rowId] of ["0:0", "0:1", "0:2"].entries()) {
      const row = document.createElement("div");
      row.dataset.sessionObservationId = "generation";
      row.dataset.sessionTranscriptRowId = rowId;
      row.getBoundingClientRect = () => new DOMRect(0, index * 100, 100, 0);
      traceElement.append(row);
    }

    const { result } = renderHook(() =>
      useSessionConversationTimelineController([{ trace }]),
    );
    act(() => result.current.onSelect(0, "generation", "0:2"));
    expect(result.current.activeItemId).toBe("trace");
    expect(feed.scrollTo).toHaveBeenCalledWith({
      top: 100,
      behavior: "smooth",
    });
  });

  it("waits for a virtualized row to mount before scrolling", async () => {
    const feed = document.createElement("div");
    feedRef.current = feed;
    feed.scrollTo = vi.fn();
    const { result } = renderHook(() =>
      useSessionConversationTimelineController([{ trace }]),
    );
    act(() => result.current.onSelect(0, "generation", "0:1"));
    expect(feed.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    vi.mocked(feed.scrollTo).mockClear();

    const traceElement = document.createElement("div");
    traceElement.dataset.sessionTraceId = trace.id;
    const row = document.createElement("div");
    row.dataset.sessionObservationId = "generation";
    row.dataset.sessionTranscriptRowId = "0:1";
    row.getBoundingClientRect = () => new DOMRect(0, 200, 100, 0);
    traceElement.append(row);
    feed.append(traceElement);
    await waitFor(() => expect(feed.scrollTo).toHaveBeenCalledOnce());
  });
});
