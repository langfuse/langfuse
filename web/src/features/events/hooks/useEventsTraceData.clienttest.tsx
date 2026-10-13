import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useEventsTraceData } from "@/src/features/events/hooks/useEventsTraceData";

const { mockByTraceId, mockBatchIO, mockScoresForTrace } = vi.hoisted(() => ({
  mockByTraceId: vi.fn(),
  mockBatchIO: vi.fn(),
  mockScoresForTrace: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  sendAsPostOption: {},
  api: {
    events: {
      byTraceId: {
        useQuery: (input: unknown, options: unknown) =>
          mockByTraceId(input, options),
      },
      batchIO: {
        useQuery: (input: unknown, options: unknown) =>
          mockBatchIO(input, options),
      },
      scoresForTrace: {
        useQuery: (input: unknown, options: unknown) =>
          mockScoresForTrace(input, options),
      },
    },
  },
}));

const date = new Date("2024-01-01T00:00:00.000Z");
const observation = (id: string) => ({
  id,
  projectId: "p",
  environment: "default",
  type: "SPAN",
  name: id,
  startTime: date,
  endTime: null,
  parentObservationId: null,
  metadata: "{}",
  tags: [],
  traceTags: [],
  bookmarked: false,
  public: false,
  release: null,
  version: null,
  userId: null,
  sessionId: null,
  createdAt: date,
  updatedAt: date,
});

const events = (
  rootId: string,
  isPlaceholderData: boolean,
  maxObservationsPerTrace = 100,
) => ({
  data: {
    observations: [observation(rootId)],
    cutoffObservationsAfterMaxCount: false,
    maxObservationsPerTrace,
  },
  isLoading: false,
  error: null,
  isPlaceholderData,
});

const scores = (isPlaceholderData: boolean) => ({
  data: [],
  isLoading: false,
  error: null,
  isPlaceholderData,
});

const batchIOEnabled = () =>
  (mockBatchIO.mock.calls.at(-1)?.[1] as { enabled: boolean }).enabled;

describe("useEventsTraceData across a trace switch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatchIO.mockReturnValue({ data: undefined });
  });

  it("keeps the previous trace whole until observations and scores both carry the next one", () => {
    mockByTraceId.mockReturnValue(events("old-root", false));
    mockScoresForTrace.mockReturnValue(scores(false));
    const { result, rerender } = renderHook(
      ({ traceId }) => useEventsTraceData({ projectId: "p", traceId }),
      { initialProps: { traceId: "old" } },
    );
    expect(result.current.data?.id).toBe("old");
    expect(batchIOEnabled()).toBe(true);

    // Switch: both queries serve the previous trace as placeholder.
    mockByTraceId.mockReturnValue(events("old-root", true));
    mockScoresForTrace.mockReturnValue(scores(true));
    rerender({ traceId: "new" });
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.id).toBe("old");
    expect(result.current.data?.observations[0]?.traceId).toBe("old");
    // No root I/O request pairing the old root with the new trace id.
    expect(batchIOEnabled()).toBe(false);

    // Observations landed, scores still the previous trace's.
    mockByTraceId.mockReturnValue(events("new-root", false));
    rerender({ traceId: "new" });
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.id).toBe("old");
    expect(batchIOEnabled()).toBe(true);

    mockScoresForTrace.mockReturnValue(scores(false));
    rerender({ traceId: "new" });
    expect(result.current.isPlaceholderData).toBe(false);
    expect(result.current.data?.id).toBe("new");
    expect(result.current.data?.observations[0]?.id).toBe("new-root");
  });
});
