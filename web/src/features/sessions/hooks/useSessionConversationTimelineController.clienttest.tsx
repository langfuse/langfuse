import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSessionConversationTimelineController } from "./useSessionConversationTimelineController";
import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";

const { feedRef, selectTrace } = vi.hoisted(() => ({
  feedRef: { current: null as HTMLDivElement | null },
  selectTrace: vi.fn(),
}));

vi.mock("@tanstack/react-virtual", () => ({ useVirtualizer: () => ({}) }));
vi.mock("@/src/hooks/useElementSize", () => ({
  useElementSize: () => [feedRef, { height: 500 }],
}));
vi.mock("@/src/hooks/useVirtualizedScrollSpy", () => ({
  useVirtualizedScrollSpy: () => ({
    activeItemId: "trace",
    virtualItems: [],
    selectItem: selectTrace,
  }),
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
  vi.clearAllMocks();
});

describe("useSessionConversationTimelineController", () => {
  it("scrolls to the exact row when multiple rows share an observation", () => {
    const feed = document.createElement("div");
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
    expect(selectTrace).toHaveBeenCalledWith(0);
    expect(feed.scrollTo).toHaveBeenCalledWith({
      top: 200,
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
    expect(feed.scrollTo).not.toHaveBeenCalled();

    const traceElement = document.createElement("div");
    traceElement.dataset.sessionTraceId = trace.id;
    const row = document.createElement("div");
    row.dataset.sessionObservationId = "generation";
    row.dataset.sessionTranscriptRowId = "0:1";
    traceElement.append(row);
    feed.append(traceElement);
    await waitFor(() => expect(feed.scrollTo).toHaveBeenCalledOnce());
  });
});
