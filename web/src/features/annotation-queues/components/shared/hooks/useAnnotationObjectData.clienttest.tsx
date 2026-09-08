import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AnnotationQueueObjectType } from "@langfuse/shared";
import { useAnnotationObjectData } from "./useAnnotationObjectData";

const { mockUseEventsTraceData } = vi.hoisted(() => ({
  mockUseEventsTraceData: vi.fn(),
}));

vi.mock("@/src/features/events/hooks/useReadPath", () => ({
  useReadPath: () => ({ isV4: true }),
}));
vi.mock("@/src/features/events/hooks/useEventsTraceData", () => ({
  useEventsTraceData: (input: unknown) => mockUseEventsTraceData(input),
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    traces: {
      byIdWithObservationsAndScores: { useQuery: () => ({}) },
    },
    sessions: {
      byIdWithScores: { useQuery: () => ({}) },
      byIdWithScoresFromEvents: { useQuery: () => ({}) },
    },
  },
}));

describe("useAnnotationObjectData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseEventsTraceData.mockReturnValue({
      data: { id: "trace-1" },
      isLoading: false,
      error: null,
    });
  });

  it("keeps v4 trace annotations scoped to their trace", () => {
    const item = {
      objectId: "trace-1",
      objectType: AnnotationQueueObjectType.TRACE,
    } as unknown as NonNullable<Parameters<typeof useAnnotationObjectData>[0]>;

    const { result } = renderHook(() => useAnnotationObjectData(item, "p"));

    expect(mockUseEventsTraceData).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: "trace-1",
        scopeToSession: false,
      }),
    );
    expect(result.current.data).toEqual({ id: "trace-1" });
    expect(result.current.isLoading).toBe(false);
  });
});
